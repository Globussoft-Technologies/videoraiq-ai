import twilio from 'twilio';
import { buildIncidentMessage ,buildVerificationLinkMessage} from '../message.helper.js';
import config from 'config'
const client = twilio(config.get("Twilio.TWILIO_ACCOUNT_SID"), config.get("Twilio.TWILIO_AUTH_TOKEN"));

export const sendIncidentSMS = async (incident, recipientNumbers) => {
  const messageBody = buildIncidentMessage(incident);

  if (!Array.isArray(recipientNumbers)) {
    recipientNumbers = [recipientNumbers]; // Normalize to array
  }
  try {
    const results = await Promise.all(
      recipientNumbers.map(async (number) => {
        const message = await client.messages.create({
          body: messageBody,
          from: config.get("Twilio.TWILIO_PHONE_NUMBER"),
          to: number
        });

        console.log(`SMS sent to ${number}:`, message.sid);
        return { number, sid: message.sid };
      })
    );

    return results;
  } catch (error) {
    console.error("Failed to send one or more SMS messages:", error);
    throw error;
  }
};



export const sendVerificationSMS = async (verificationLink, recipientNumber) => {
  const messageBody = buildVerificationLinkMessage(verificationLink); // A simple string: `Your verification code is ${otp}`

  try {
    const message = await client.messages.create({
      body: messageBody,
      from: config.get("Twilio.TWILIO_PHONE_NUMBER"),
      to: recipientNumber
    });

    return message;
  } catch (error) {
    console.error("Failed to send verificationLink SMS:", error);
    throw error;
  }
};