import { Resend } from "resend";
import { env } from "./env";
import { WelcomeEmail, ResetPasswordEmail } from "./email/templates";

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Notification flow: all welcome and reset emails go to the configured
 * ADMIN_NOTIFICATION_EMAIL (sandbox-compatible) so the admin can forward
 * credentials/links to the target user via WhatsApp or another channel.
 */
export async function sendWelcomeEmail(params: {
  targetName: string;
  targetEmail: string;
  temporaryPassword: string;
}) {
  const loginUrl = `${env.APP_URL}/login`;
  const html = WelcomeEmail({
    targetName: params.targetName,
    targetEmail: params.targetEmail,
    temporaryPassword: params.temporaryPassword,
    loginUrl,
  });

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: `Nuevo usuario: ${params.targetName}`,
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send welcome email: ${result.error.message}`);
  }
  return result.data;
}

export async function sendPasswordResetEmail(params: {
  targetName: string;
  targetEmail: string;
  token: string;
}) {
  const resetUrl = `${env.APP_URL}/reset-password/${params.token}`;
  const html = ResetPasswordEmail({
    targetName: params.targetName,
    targetEmail: params.targetEmail,
    resetUrl,
  });

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: `Reset de contraseña: ${params.targetName}`,
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send reset email: ${result.error.message}`);
  }
  return result.data;
}
