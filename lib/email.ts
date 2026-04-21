import { Resend } from "resend";
import { env } from "./env";
import { WelcomeEmail, ResetPasswordEmail } from "./email/templates";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  temporaryPassword: string;
}) {
  const loginUrl = `${env.APP_URL}/login`;
  const html = WelcomeEmail({
    name: params.name,
    temporaryPassword: params.temporaryPassword,
    loginUrl,
  });

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: params.to,
    subject: "Bienvenido a Padel Prode",
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send welcome email: ${result.error.message}`);
  }
  return result.data;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  token: string;
}) {
  const resetUrl = `${env.APP_URL}/reset-password/${params.token}`;
  const html = ResetPasswordEmail({ name: params.name, resetUrl });

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: params.to,
    subject: "Restablecer tu contraseña",
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send reset email: ${result.error.message}`);
  }
  return result.data;
}
