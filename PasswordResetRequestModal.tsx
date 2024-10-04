import ResendButtonWithTimer from '../ResendButtonWithTimer/ResendButtonWithTimer';
import React, { useCallback, useEffect, useState } from 'react';
import {
  EMAIL_RESEND_TIME_LIMIT_SECONDS,
  MAXIMUM_FORGOT_PASSWORD_EMAILS_PER_USER,
} from 'shared/constants/auth.constants';
import { EmailType } from 'shared/enums/auth/email-type.enum';
import { SendEmailResult } from 'shared/enums/auth/send-email-result.enum';
import { auth } from 'src/api/auth/auth';
import verifyEmail from 'src/assets/images/doodles/verify-email.svg';
import Button from 'src/components/Button/Button';
import { ButtonSize } from 'src/components/Button/button-size.enum';
import { ButtonState } from 'src/components/Button/button-state.enum';
import { ButtonType } from 'src/components/Button/button-type.enum';
import { useTranslationByKey } from 'src/hooks/use-translation-by-key';

const PasswordResetRequestModal: React.FC<{ email: string }> = ({ email }) => {
  const [resendLimitReached, setResendLimitReached] = useState(false);
  const [isResendButtonDisabled, setIsResendButtonDisabled] = useState(false);
  const [timer, setTimer] = useState(0);

  const t = useTranslationByKey('FEATURES.AUTH.PASSWORD_RESET_REQUEST_MODAL');

  const handleResendEmail = useCallback(async () => {
    if (isResendButtonDisabled) {
      return;
    }
    setIsResendButtonDisabled(true);
    setTimer(EMAIL_RESEND_TIME_LIMIT_SECONDS);
    const countdown = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          setIsResendButtonDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    const response: SendEmailResult = await auth.forgotPassword(email);
    if (response === SendEmailResult.MaxEmailsLimitReached) {
      setResendLimitReached(true);
      return;
    }
  }, [email, isResendButtonDisabled]);

  useEffect(() => {
    const fetchEmailCount = async () => {
      const totalForgotPasswordEmails = await auth.getEmailCount(email, EmailType.PasswordReset);
      if (totalForgotPasswordEmails >= MAXIMUM_FORGOT_PASSWORD_EMAILS_PER_USER) {
        setResendLimitReached(true);
      }
    };
    void handleResendEmail();
    void fetchEmailCount();
  }, [email, handleResendEmail]);

  const handleContactSupport = () => {
    // TODO: Implement the contact support functionality
    alert(
      'you pressed contact support, but the functionality is not implemented yet, so this message is all that you will get...'
    );
  };

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <h1 className="font-alice text-content-neutral-default-enabled z-10 p-4 font-normal whitespace-pre-wrap sm:pb-4">
        {t('TEXT_RESET_PASSWORD')}
      </h1>
      <div>
        <img src={verifyEmail} className="transform top-0 z-0" style={{ left: '0%' }} />
      </div>
      <div className="whitespace-pre-wrap">
        <p className="text-body-p2">
          {t('TEXT_WE_SENT_A_PASSWORD_RESET_LINK_TO')}{' '}
          <span className="font-weight-medium text-body-p2-medium">{email}</span>.
        </p>

        <p className="text-body-p2 text-content-neutral-subtle-enabled pt-5">{t('TEXT_PLEASE_CHECK_YOUR_INBOX')}</p>
      </div>

      {resendLimitReached ? (
        <div className="w-full flex justify-center items-center">
          <p className="text-body-p2 text-content-neutral-subtle-enabled w-auto">{t('TEXT_RESEND_LIMIT_REACHED')}</p>
          <Button
            className="w-auto pl-1"
            label={t('TEXT_CONTACT_SUPPORT')}
            onClick={handleContactSupport}
            state={ButtonState.Enabled}
            type={ButtonType.Link}
            size={ButtonSize.Big}
          />
        </div>
      ) : (
        <ResendButtonWithTimer
          label={t('TEXT_RESEND_EMAIL')}
          onClick={() => void handleResendEmail}
          isDisabled={isResendButtonDisabled}
          timer={timer}
        />
      )}
    </div>
  );
};

export default PasswordResetRequestModal;
