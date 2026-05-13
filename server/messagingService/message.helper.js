import config from 'config';
export const buildIncidentMessage = (incident) => {
  const {
    incidentName,
    incidentType,
    timeOfIncident,
    severity,
    zone,
    cameraId,
    videoLink
  } = incident;

  const normalize = (text = '') =>
    text
      .replace(/[\u2018\u2019\u201C\u201D]/g, "'")  // smart quotes → apostrophe
      .replace(/[\u2002\u2003\u00A0]/g, ' ')       // en space/em space/nbsp → normal space
      .replace(/[^\x00-\x7F]/g, '');               // remove non-ASCII (optional)

  let details = `🚨 Type: ${normalize(incidentType.replace(/_/g, ' '))}\n`;
  details += `Time: ${new Date(timeOfIncident).toLocaleString()}\n`;
  if (videoLink) details += `📹 Video: ${normalize(videoLink)}\n`;

  return details;
};

export const buildVerificationLinkMessage = (token) => {
  const verificationUrl = `${config.get('verificationLink')}${token}`;
  return `Click the link below to verify your email:\n${verificationUrl}\n\nThis link will expire in 10 minutes.`;
};
