export const domainTemplate = (domainName, ip, port) => {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Domain Pointing Request</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
              
              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 0 10px 0;">
                  <img src="https://i.postimg.cc/CL6Ws6bK/Videora-IQlogo.png" alt="VideoraIQ" style="max-width:200px; display:block;">
                </td>
              </tr>
  
              <!-- Header -->
              <tr>
                <td align="center" style="padding:10px 20px;">
                  <h2 style="margin:0; font-size:22px; color:#07486A;">New Domain Pointing Request</h2>
                </td>
              </tr>
  
              <!-- Message -->
              <tr>
                <td style="padding:0 30px 20px 30px; color:#444444; font-size:15px; line-height:1.6; text-align:center;">
                  <p style="margin:0 0 10px 0;">Hello <strong>Admin</strong>,</p>
                  <p style="margin:0;">A new domain pointing has been requested. Below are the details:</p>
                </td>
              </tr>
  
              <!-- Domain Details -->
              <tr>
                <td align="center" style="padding:10px 30px;">
                  <table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse; width:100%; max-width:400px; margin:auto;">
                    <tr style="background-color:#f9f9f9;">
                      <td align="left" style="font-weight:500; color:#07486A;">Domain Name:</td>
                      <td align="left" style="color:#333333;">${domainName}</td>
                    </tr>
                    <tr>
                      <td align="left" style="font-weight:500; color:#07486A;">IP Address:</td>
                      <td align="left" style="color:#333333;">${ip}</td>
                    </tr>
                    <tr>
                      <td align="left" style="font-weight:500; color:#07486A;">Port:</td>
                      <td align="left" style="color:#333333;">${port}</td>
                    </tr>
                  </table>
                </td>
              </tr>
  
              <!-- Footer Note -->
              <tr>
                <td align="center" style="padding:20px 30px 10px 30px; color:#7a7a7a; font-size:13px; line-height:1.5;">
                  <p style="margin:0;">You are receiving this notification because a new domain was added to Videora IQ.</p>
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
                  <p style="margin:5px 0;">Need help? Contact us at 
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
