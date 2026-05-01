import nodemailer from "nodemailer";

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587", 10),
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  appUrl: string
): Promise<void> {
  const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
  const transporter = createTransport();
  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@persfin.app";

  if (!transporter) {
    // No SMTP configured — fall back to console so dev flow still works
    console.log(`[EMAIL] Password reset link for ${toEmail}:`);
    console.log(`[EMAIL] ${resetLink}`);
    return;
  }

  await transporter.sendMail({
    from: `"PersFin" <${fromAddress}>`,
    to: toEmail,
    subject: "Reset your PersFin password",
    text: `You requested a password reset.\n\nClick the link below to set a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#2c3e50;margin-bottom:8px;">Reset your password</h2>
        <p style="color:#555;font-size:14px;">You requested a password reset for your PersFin account.</p>
        <p style="color:#555;font-size:14px;">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${resetLink}"
             style="background:#2c3e50;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">
            Reset Password
          </a>
        </div>
        <p style="color:#999;font-size:12px;">Or copy this link into your browser:<br/><a href="${resetLink}" style="color:#3498db;">${resetLink}</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
        <p style="color:#bbb;font-size:11px;">If you did not request this, you can safely ignore this email. Your password will not change.</p>
      </div>`,
  });
}
