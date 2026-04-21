export function WelcomeEmail({
  targetName,
  targetEmail,
  temporaryPassword,
  loginUrl,
}: {
  targetName: string;
  targetEmail: string;
  temporaryPassword: string;
  loginUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a;">
    <h1 style="color: #2c8852;">Nuevo usuario creado en Padel Prode</h1>
    <p>Se creó un usuario nuevo que necesita sus credenciales iniciales:</p>
    <ul>
      <li><strong>Nombre:</strong> ${escapeHtml(targetName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(targetEmail)}</li>
      <li><strong>Contraseña temporal:</strong> <code>${escapeHtml(
        temporaryPassword
      )}</code></li>
    </ul>
    <p>
      Pasale al usuario el link de ingreso y la contraseña temporal (por WhatsApp
      u otro canal):
    </p>
    <p>
      <a href="${loginUrl}" style="display:inline-block;background:#2c8852;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        ${loginUrl}
      </a>
    </p>
    <p style="color:#666;font-size:14px;">
      En su primer ingreso, el sistema le va a pedir que cambie la contraseña.
    </p>
  </body>
</html>
  `.trim();
}

export function ResetPasswordEmail({
  targetName,
  targetEmail,
  resetUrl,
}: {
  targetName: string;
  targetEmail: string;
  resetUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a;">
    <h1 style="color: #2c8852;">Reset de contraseña pedido</h1>
    <p>
      <strong>${escapeHtml(targetName)}</strong> (${escapeHtml(
    targetEmail
  )}) pidió resetear su contraseña de Padel Prode.
    </p>
    <p>Pasale el link de abajo (válido por 1 hora):</p>
    <p>
      <a href="${resetUrl}" style="display:inline-block;background:#2c8852;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        ${resetUrl}
      </a>
    </p>
    <p style="color:#666;font-size:14px;">
      Si no reconocés al usuario o fue un pedido no autorizado, ignoralo.
    </p>
  </body>
</html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
