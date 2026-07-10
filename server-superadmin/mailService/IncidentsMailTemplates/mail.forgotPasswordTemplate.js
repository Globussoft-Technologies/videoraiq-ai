export const forgotPasswordTemplate = (userName, resetLink) => {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            
            <!-- Logo -->
            <tr>
              <td align="center" style="padding:30px 0 10px 0;">
                <img src="https://i.postimg.cc/CL6Ws6bK/Videora-IQlogo.png" alt="VideralQ" style="max-width:200px; display:block;">
              </td>
            </tr>

            <!-- Header -->
            <tr>
              <td align="center" style="padding:10px 20px;">
                <h2 style="margin:0; font-size:22px; color:#07486A;">Reset Your Password</h2>
              </td>
            </tr>

            <!-- Illustration -->
            <tr>
              <td align="center" style="padding:10px 20px;">
                <img src="https://i.postimg.cc/QCZrMSsN/forgot-password.png" alt="Forgot Password" style="width:100px; margin:20px auto;">
              </td>
            </tr>

            <!-- Message -->
            <tr>
              <td style="padding:0 30px 20px 30px; color:#444444; font-size:15px; line-height:1.6; text-align:center;">
                <p style="margin:0 0 10px 0;">Hello <strong>${userName || 'User'}</strong>,</p>
                <p style="margin:0;">We received a request to reset your password. Click the button below to set up a new one. If you didn’t request this, you can safely ignore this email.</p>
              </td>
            </tr>

            <!-- Reset Button -->
            <tr>
              <td align="center" style="padding:20px 0;">
                <a href="${resetLink}" target="_blank" 
                  style="display:inline-block; padding:12px 28px; background-color:#07486A; color:#ffffff; 
                  font-size:15px; border-radius:30px; text-decoration:none; font-weight:500;">
                  Reset Password
                </a>
              </td>
            </tr>

            <!-- Expiry Note -->
            <tr>
              <td align="center" style="padding:0 30px 20px 30px; color:#7a7a7a; font-size:13px; line-height:1.4;">
                <p style="margin:0;">This link will expire in <strong>15 minutes</strong> for your security.</p>
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
              <td align="center" style="padding:15px 20px; color:#999999; font-size:12px;">
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
