// TODO: The code here can be refactored (DRY) once we start using email templates

import {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_SES_SENDER_EMAIL,
  AWS_REGION,
  FRONTEND_URL,
} from '../config/configuration.constants';
import { AppConfig } from '../config/configuration.interface';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetEmailSendingFailedException } from 'src/common/exceptions/password-reset-email-sending-failed.exception';
import { VerificationEmailSendingFailedException } from 'src/common/exceptions/verification-email-sending-failed.exception';

/**
 * Service responsible for sending emails using Amazon SES.
 * It handles the configuration of the SES client and provides methods for sending different types of emails.
 */
@Injectable()
export class EmailService {
  private ses: SESClient;

  constructor(private configService: ConfigService<AppConfig>) {
    this.ses = new SESClient({
      region: this.configService.get(AWS_REGION),
      credentials: {
        accessKeyId: this.configService.get(AWS_ACCESS_KEY_ID),
        secretAccessKey: this.configService.get(AWS_SECRET_ACCESS_KEY),
      },
    });
  }

  /**
   * Sends a verification email to the specified email address.
   *
   * @param to - The recipient's email address
   * @param verificationToken - The token used to verify the email
   * @returns The verification link (temporary, for testing)
   * @throws VerificationEmailSendingException if there's an error sending the email
   */
  async sendVerificationEmail(to: string, verificationToken: string): Promise<void> {
    try {
      const verificationLink = `${this.configService.get(FRONTEND_URL)}/email-verification-callback?token=${verificationToken}`;
      const senderEmail: string = this.configService.get(AWS_SES_SENDER_EMAIL);

      const params = {
        Source: senderEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: 'Sproutful - Email verification' },
          Body: {
            Html: {
              Data: `Please click the following link to verify your email: ${verificationLink}`,
            },
          },
        },
      };

      const command = new SendEmailCommand(params);

      await this.ses.send(command);
    } catch (error) {
      // TODO: Log the error in the database, so it can be investigated
      throw new VerificationEmailSendingFailedException();
    }
  }

  /**
   * Sends a password reset email to the specified email address.
   *
   * @param to - The recipient's email address
   * @param resetToken - The token for resetting the password
   * @throws PasswordResetEmailSendingException if there's an error sending the email
   */
  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    try {
      const senderEmail: string = this.configService.get(AWS_SES_SENDER_EMAIL);
      const resetUrl = `${this.configService.get('FRONTEND_URL')}/password-reset-callback?token=${resetToken}`;

      const params = {
        Source: senderEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: 'Password Reset Request for Sproutful' },
          Body: {
            Html: {
              Data: `
              <h1>Password Reset Request</h1>
              <p>You have requested to reset your password. Please click the link below to set a new password:</p>
              <a href="${resetUrl}">Reset Password</a>
              <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
            `,
            },
          },
        },
      };

      const command = new SendEmailCommand(params);
      await this.ses.send(command);
    } catch (error) {
      // TODO: Log the error in the database, so it can be investigated
      throw new PasswordResetEmailSendingFailedException();
    }
  }

  /**
   * Sends a password reset confirmation email to the specified email address.
   *
   * @param to - The recipient's email address
   * @throws PasswordResetEmailSendingException if there's an error sending the email
   */
  async sendPasswordResetConfirmationEmail(to: string): Promise<void> {
    try {
      const senderEmail: string = this.configService.get(AWS_SES_SENDER_EMAIL);

      const params = {
        Source: senderEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: 'Your Sproutful Password Has Been Reset' },
          Body: {
            Html: {
              Data: `
              <h1>Password Reset Confirmation</h1>
              <p>This email is to confirm that your password for Sproutful has been successfully reset.</p>
              <p>If you did not initiate this password reset, please contact our support team immediately.</p>
              <p>Thank you for using Sproutful!</p>
            `,
            },
          },
        },
      };

      const command = new SendEmailCommand(params);
      await this.ses.send(command);
    } catch (error) {
      // TODO: Log the error in the database, so it can be investigated
      throw new PasswordResetEmailSendingFailedException();
    }
  }
}
