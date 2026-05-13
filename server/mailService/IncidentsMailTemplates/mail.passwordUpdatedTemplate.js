export const passwordUpdatedTemplate = (userName, email, newPassword, updatedAt) => {
  const formattedDate = new Date(updatedAt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Updated</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1);">

            <!-- Logo -->
            <tr>
              <td align="center" style="padding:30px 0 10px 0;">
                <img src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp" alt="VideraIQ" style="max-width:200px; display:block;">
              </td>
            </tr>

            <!-- Header Banner -->
            <tr>
              <td style="background-color:#07486A; padding:18px 30px;" align="center">
                <h2 style="margin:0; color:#ffffff; font-size:20px; letter-spacing:0.5px;">🔐 Password Updated Successfully</h2>
              </td>
            </tr>

            <!-- Greeting -->
            <tr>
              <td style="padding:28px 30px 10px 30px; color:#333333; font-size:15px; line-height:1.7;">
                <p style="margin:0 0 10px 0;">Hello <strong>${userName || 'User'}</strong>,</p>
                <p style="margin:0;">Your account password has been updated by an administrator. Below are your updated login credentials:</p>
              </td>
            </tr>

            <!-- Credentials Card -->
            <tr>
              <td style="padding:16px 30px 24px 30px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                  style="background-color:#f0f6fa; border-radius:8px; border-left:4px solid #07486A; padding:0;">
                  <tr>
                    <td style="padding:20px 24px;">
                      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size:14px; color:#333333;">
                        <tr>
                          <td style="width:40%; font-weight:600; color:#07486A;">Name</td>
                          <td>${userName || '—'}</td>
                        </tr>
                        <tr>
                          <td style="font-weight:600; color:#07486A;">Email</td>
                          <td>${email || '—'}</td>
                        </tr>
                        <tr>
                          <td style="font-weight:600; color:#07486A;">New Password</td>
                          <td>
                            <span style="display:inline-block; background-color:#07486A; color:#ffffff; padding:4px 14px; border-radius:20px; font-size:14px; letter-spacing:1px; font-weight:500;">
                              ${newPassword}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td style="font-weight:600; color:#07486A;">Updated At</td>
                          <td>${formattedDate}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Security Note -->
            <tr>
              <td style="padding:0 30px 24px 30px; color:#666666; font-size:13px; line-height:1.6;">
                <p style="margin:0;">For security, we recommend logging in and changing your password at your earliest convenience. If you did not expect this change, please contact your administrator immediately.</p>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 20px;">
                <hr style="border:none; border-top:1px solid #eeeeee;">
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="padding:16px 20px; color:#999999; font-size:12px;">
                <p style="margin:5px 0;">© ${new Date().getFullYear()} Videora IQ. All Rights Reserved.</p>
                <p style="margin:5px 0;">If you need help, contact us at
                  <a href="mailto:support@videora.com" style="color:#07486A; text-decoration:none;">support@videora.com</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
};
