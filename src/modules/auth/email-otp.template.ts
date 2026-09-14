/** Inline styles and presentation tables keep the email usable across mail clients. */
export function renderEmailOtp(otp: string, expiryMinutes: number): string {
  const code = otp.replace(/[^0-9]/g, '');
  const minutes = Math.max(1, Math.floor(expiryMinutes));
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your GreenNest verification code</title></head>
<body style="margin:0;padding:0;background-color:#F3F5EF;color:#203D30;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">One small step to your green corner. Your sign-in code expires in ${minutes} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F5EF;">
    <tr><td align="center" style="padding:16px 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">
        <tr><td align="center" style="padding:0 0 12px;font-size:23px;font-weight:700;letter-spacing:-0.8px;color:#214C38;">GreenNest<span style="color:#79A35C;">.</span></td></tr>
        <tr><td style="background-color:#FFFFFF;border:1px solid #E0E7DB;border-radius:24px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:20px 22px;background-color:#214C38;border-radius:23px 23px 0 0;">
              <p style="margin:0 0 8px;font-size:11px;line-height:18px;letter-spacing:2px;font-weight:700;color:#CFE0B8;">GROW A LITTLE EVERY DAY</p>
              <h1 style="margin:0;font-size:24px;line-height:30px;letter-spacing:-0.8px;font-weight:700;color:#FFFFFF;">Your sign-in code</h1>
            </td></tr>
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 16px;font-size:14px;line-height:21px;color:#66736A;">Enter this code in GreenNest to sign in.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0F5E9;border:1px solid #DCE7CF;border-radius:16px;">
                <tr><td align="center" style="padding:14px 8px 4px;font-size:10px;line-height:16px;font-weight:700;letter-spacing:2px;color:#526D44;">YOUR VERIFICATION CODE</td></tr>
                <tr><td align="center" style="padding:0 8px 6px;font-family:Consolas,'Courier New',monospace;font-size:32px;line-height:44px;letter-spacing:4px;font-weight:700;color:#214C38;white-space:nowrap;">${code}</td></tr>
                <tr><td align="center" style="padding:0 12px 14px;font-size:12px;line-height:20px;color:#66765A;">Valid for <strong>${minutes} minutes</strong> &middot; One-time use</td></tr>
              </table>
              <p style="margin:14px 0 0;font-size:12px;line-height:19px;color:#66736A;">Keep this code private. Never share it with anyone.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
                <tr><td style="border-top:1px solid #E8EDE4;padding-top:12px;font-size:12px;line-height:20px;color:#7B847C;">Didn't request this code? You can safely ignore this email.</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:12px 12px 0;font-size:12px;line-height:20px;color:#76816F;">Sent with care by <strong style="color:#49623D;">GreenNest</strong></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
