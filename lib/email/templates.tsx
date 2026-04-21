export function WelcomeEmail({
  name,
  temporaryPassword,
  loginUrl,
}: {
  name: string;
  temporaryPassword: string;
  loginUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a;">
    <h1 style="color: #2c8852;">Bienvenido, ${escapeHtml(name)}</h1>
    <p>Te damos la bienvenida al prode de padel. Acá están tus credenciales iniciales:</p>
    <ul>
      <li><strong>Contraseña temporal:</strong> <code>${escapeHtml(
        temporaryPassword
      )}</code></li>
    </ul>
    <p>
      <a href="${loginUrl}" style="display:inline-block;background:#2c8852;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        Ingresar
      </a>
    </p>
    <p style="color:#666;font-size:14px;">En tu primer ingreso te vamos a pedir que cambies la contraseña.</p>
  </body>
</html>
  `.trim();
}

export function ResetPasswordEmail({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a;">
    <h1 style="color: #2c8852;">Restablecer tu contraseña</h1>
    <p>Hola ${escapeHtml(name)},</p>
    <p>Recibimos un pedido para restablecer tu contraseña. Hacé clic en el link de abajo (válido por 1 hora):</p>
    <p>
      <a href="${resetUrl}" style="display:inline-block;background:#2c8852;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        Elegir nueva contraseña
      </a>
    </p>
    <p style="color:#666;font-size:14px;">Si no pediste esto, podés ignorar este mail.</p>
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
