import { ACCESS_TOKEN_EXPIRATION_SECONDS } from '../auth/auth.constants';
import { GoogleSsoJwtDecodedPayload } from '../auth/interfaces/google-sso-jwt-decoded-payload.interface';
import { GoogleSsoJwtDecodedToken } from '../auth/interfaces/google-sso-jwt-decoded-token.interface';
import { AuthenticationLogService } from '../auth/services/authentication-log.service';
import { EmailService } from '../email/email.service';
import { OPENID_CLIENT } from '../openid/openid.constants';
import { RefreshTokenService } from '../refresh-token/refresh-token.service';
import { UserVerificationService } from '../user-verification/user-verification.service';
import { GoogleUserDto } from '../user/dto/google-user.dto';
import { UserService } from '../user/user.service';
import { GoogleSsoRepository } from './google-sso.repository';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokens } from '@shared/interfaces/auth/auth-tokens.interface';
import { plainToClass } from 'class-transformer';
import { Client } from 'openid-client';
import { AuthService } from 'src/auth/auth.service';
import { UserRequestInfoDto } from 'src/common/dto/user-request-info.dto';
import { AuthenticationEventType } from 'src/common/enums/authentication-event-type.enum';
import { AuthenticationLogErrorMessages } from 'src/common/enums/authentication-log-error-messages.enum';
import { AuthenticationMethod } from 'src/common/enums/authentication-method.enum';
import { AuthenticationStatus } from 'src/common/enums/authentication-status.enum';
import { ExpiredRefreshTokenException } from 'src/common/exceptions/expired-refresh-token.exception';
import { GoogleAuthFailedException } from 'src/common/exceptions/google-auth-failed.exception';
import { InvalidRefreshTokenException } from 'src/common/exceptions/invalid-refresh-token.exception';
import { UnexpectedErrorWhenLoggingOutException } from 'src/common/exceptions/unexpected-error-when-logging-out.exception';
import { UnexpectedErrorWhenRefreshingAccessTokenException } from 'src/common/exceptions/unexpected-error-when-refreshing-access-token.exception';
import { UserNotFoundException } from 'src/common/exceptions/user-not-found.exception';
import { generateJwtToken } from 'src/common/helpers/jwt.helper';
import { RefreshToken, User } from 'src/common/interfaces/database.interface';
import { CreateUserDto } from 'src/user/dto/create-user.dto';

@Injectable()
export class GoogleSsoService {
  constructor(
    private googleSsoRepository: GoogleSsoRepository,
    private userService: UserService,
    private userVerificationService: UserVerificationService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
    private authenticationLogService: AuthenticationLogService,
    private emailService: EmailService,
    @Inject(OPENID_CLIENT) private googleClient: Client,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService
  ) {}

  /**
   * Creates a new user using Google SSO.
   *
   * @param refreshToken - The refresh token provided by Google
   * @param userRequestInfoDto - The user request info
   * @returns An object containing the access token and refresh token
   */
  async createGoogleSsoUser(refreshToken: string, userRequestInfoDto: UserRequestInfoDto): Promise<AuthTokens> {
    // Calling a refresh will help us validate if the user is valid
    const newTokenSet = await this.googleClient.refresh(refreshToken);
    const decodedToken = this.jwtService.decode<GoogleSsoJwtDecodedToken | null>(newTokenSet.id_token, {
      complete: true,
    });

    // Create a new user
    const createUserDto: Partial<CreateUserDto> = {
      email: decodedToken.payload.email,
    };
    const user = await this.userService.createUser(createUserDto);

    // Create entry in the database for Google SSO
    const googleUser = plainToClass(GoogleUserDto, decodedToken.payload);
    await this.createGoogleSso(user.id, googleUser, JSON.stringify(googleUser));

    // Create user verification record
    await this.userVerificationService.createUserVerification(user.id);

    if (decodedToken.payload.email_verified) {
      // Mark the user as verified, if google tells us that it is verified
      await this.userVerificationService.markEmailVerified(user.id);
    } else {
      // If the user's email is not verified by google, then we want to verify it ourselves
      await this.authService.sendUserVerificationEmail(user);
    }

    await this.authenticationLogService.logAuthenticationEvent(
      user.id,
      AuthenticationEventType.Registration,
      AuthenticationMethod.GoogleSSO,
      AuthenticationStatus.Success,
      userRequestInfoDto,
      null, // Errors are not possible for this event
      null
    );

    // Update last activity
    // TODO: Update last activity once we stablish how that logic will work

    // If we have been provided a new refresh token - replace it, otherwise keep using the old one
    refreshToken = newTokenSet.refresh_token ?? refreshToken;

    // Store the refresh token in the database
    await this.refreshTokenService.createRefreshToken(user.id, refreshToken, AuthenticationMethod.GoogleSSO);

    const accessToken = generateJwtToken(this.jwtService, user, ACCESS_TOKEN_EXPIRATION_SECONDS);
    return { accessToken, refreshToken: refreshToken } as AuthTokens;
  }

  /**
   * Creates a Google SSO entry for a user.
   * @param userId - The ID of the user
   * @param googleUserDto - The Google user data
   * @param rawJson - The raw JSON string of Google user data
   */
  async createGoogleSso(userId: number, googleUserDto: GoogleUserDto, rawJson: string): Promise<void> {
    const parsedJson = JSON.parse(rawJson) as GoogleSsoJwtDecodedPayload;

    // Remove the access_token field if it exists
    delete parsedJson.access_token;

    // Convert back to string
    const sanitizedJson = JSON.stringify(parsedJson);
    await this.googleSsoRepository.createGoogleSso(userId, googleUserDto, sanitizedJson);
  }

  /**
   * Refreshes the Google access token using a refresh token.
   * @param refreshToken - The refresh token to use
   * @returns A new access token
   */
  async refreshGoogleAccessToken(refreshToken: RefreshToken, userId: number): Promise<AuthTokens> {
    try {
      if (new Date() > refreshToken.expires_on) {
        // The refresh token has expired, make sure to mark all tokens as deactivated
        await this.refreshTokenService.deactivateRefreshTokens(userId);
        throw new ExpiredRefreshTokenException();
      }

      // Use the refresh token to get a new access token
      const newTokenSet = await this.googleClient.refresh(refreshToken.token);

      // Check if the token refresh response indicates an invalid token
      if (!newTokenSet || !newTokenSet.access_token) {
        throw new UnexpectedErrorWhenRefreshingAccessTokenException();
      }

      // Update last_used_on of the refresh token
      await this.refreshTokenService.updateLastUsedOn(refreshToken.token);

      // Decode the ID token to get the user's email
      const decodedToken = this.jwtService.decode<GoogleSsoJwtDecodedToken | null>(newTokenSet.id_token, {
        complete: true,
      });
      const user: User | null = await this.userService.getUserByEmail(decodedToken?.payload?.email);
      if (!user) {
        throw new UserNotFoundException();
      }

      // Store refresh token, if provided
      let newRefreshToken: string | undefined;
      if (newTokenSet.refresh_token) {
        newRefreshToken = newTokenSet.refresh_token;
        // Deactivate all existing refresh tokens for this user
        await this.refreshTokenService.deactivateRefreshTokens(user.id);

        // Store the new token
        await this.refreshTokenService.createRefreshToken(
          user.id,
          newTokenSet.refresh_token,
          AuthenticationMethod.GoogleSSO
        );
      }

      const accessToken = generateJwtToken(this.jwtService, user, ACCESS_TOKEN_EXPIRATION_SECONDS);

      return { accessToken, refreshToken: newRefreshToken } as AuthTokens;
    } catch (error) {
      if (
        error instanceof ExpiredRefreshTokenException ||
        error instanceof UserNotFoundException ||
        error instanceof InvalidRefreshTokenException
      ) {
        throw error;
      }
      throw new UnexpectedErrorWhenRefreshingAccessTokenException();
    }
  }

  /**
   * Handles Google Login process.
   *
   * @param googleUser - The Google user data
   * @param refreshToken - The refresh token provided by Google
   * @returns A JWT access token
   */
  async googleLogin(googleUser: GoogleUserDto, refreshToken: string, userRequestInfoDto: UserRequestInfoDto) {
    const isNewUser = false;
    let userId: number | null = null;
    try {
      // Grab the user from the database
      const user: User = await this.userService.getUserByEmail(googleUser.email);

      userId = user.id;

      let refreshTokenId: number | null = null;
      // Store refresh token, if provided
      if (refreshToken) {
        // Deactivate all existing refresh tokens for this user
        await this.refreshTokenService.deactivateRefreshTokens(user.id);

        // Store the new token
        refreshTokenId = await this.refreshTokenService.createRefreshToken(
          user.id,
          refreshToken,
          AuthenticationMethod.GoogleSSO
        );
      }

      // Create entry in the database for Google SSO
      await this.createGoogleSso(user.id, googleUser, JSON.stringify(googleUser));

      // Check if the email is already verified. When the user has registered with email+password
      // the email is NOT verified by default. For cases where the email is not verified, but they
      // using Google SSO to login and google says that their email is verified - mark it as
      // verified in the database
      const isEmailVerified = await this.userVerificationService.isEmailVerified(user.id);
      if (!isEmailVerified && googleUser.emailVerified) {
        await this.userVerificationService.markEmailVerified(user.id);
      }

      // Update last activity
      // TODO: Update last activity once we stablish how that logic will work

      // Log the login event
      await this.authenticationLogService.logAuthenticationEvent(
        user.id,
        AuthenticationEventType.Login,
        AuthenticationMethod.GoogleSSO,
        AuthenticationStatus.Success,
        userRequestInfoDto,
        null, // Errors are not possible for this event
        refreshTokenId
      );

      return generateJwtToken(this.jwtService, user, ACCESS_TOKEN_EXPIRATION_SECONDS);
    } catch (error) {
      // Log the login event
      await this.authenticationLogService.logAuthenticationEvent(
        userId,
        isNewUser ? AuthenticationEventType.Registration : AuthenticationEventType.Login,
        AuthenticationMethod.GoogleSSO,
        AuthenticationStatus.Failure,
        userRequestInfoDto,
        AuthenticationLogErrorMessages.UnexpectedErrorWhenAttemptingGoogleSso,
        null
      );
      throw new GoogleAuthFailedException();
    }
  }

  /**
   * Revokes the refresh token for a Google SSO user.
   *
   * @param refreshToken - The refresh token to revoke
   * @throws InvalidRefreshTokenException if the refresh token is invalid
   * @throws UnexpectedErrorWhenLoggingOutException if any other exception occurs
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      // Revoke the Google refresh token
      await this.googleClient.revoke(refreshToken);
    } catch (error: unknown) {
      if (error instanceof InvalidRefreshTokenException) {
        throw error; // rethrow the specific exception
      } else {
        throw new UnexpectedErrorWhenLoggingOutException();
      }
    }
  }

  /**
   * Checks if a user has used Google SSO.
   *
   * @param userId - The ID of the user
   * @returns True if the user has used Google SSO, otherwise false
   */
  async usedGoogleSso(userId: number) {
    return this.googleSsoRepository.usedGoogleSso(userId);
  }
}
