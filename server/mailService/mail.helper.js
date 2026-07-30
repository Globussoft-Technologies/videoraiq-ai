
import sendGridMail from '@sendgrid/mail';
import config from 'config';
import {
    genericObjectDetectionTemplate,
    deskAbsenceTemplate,
    guardAbsenceTemplate,
    bagDetectionTemplate,
    lightDetectionTemplate,
    doorDetectionTemplate,
    countVehiclesTemplate,
    countPersonsTemplate,
    personDetectedTemplate,
    verifyEmailTemplate,
    personalProtectiveEquipmentTemplate,
    crowdDetectionTemplate,
    loiteringWithoutAuthTemplate,
    LoiteringWithAuthIncident,
    unauthorizedAccessIncident,
    LineCrossingAuthIncident,
    motionDetectionAuthTemplate,
    vehicleDetectionTemplate,
    entryLogTemplate,
    conveyorDetectionTemplate,
    crusherDetectionTemplate,
    waterSpillageDetectionTemplate,
    vehicleTypeDetectionTemplate,
    loiteringDetectionTemplate,
    vehicleObstructionTemplate,
    tableOccupancyDetectionTemplate,
    foodServicePPEDetectionTemplate,
    mobilePhoneDetectionTemplate
} from './IncidentsMailTemplates/mail.incidentsTemplate.js';
import {
    forgotPasswordTemplate
} from './IncidentsMailTemplates/mail.forgotPasswordTemplate.js';
import {
    passwordUpdatedTemplate
} from './IncidentsMailTemplates/mail.passwordUpdatedTemplate.js';
import {
    domainTemplate
} from './IncidentsMailTemplates/mail.domainTemplate.js';
import {
    trackFailedEmail,
    trackOutboundEmail
} from '../core/v2/emailMonitoring/emailTracker.js';
class MailHelper {
    _emailMetadata(args = []) {
        const data = args[1] || {};
        const detectionType = args[2];
        return {
            adminId: data?.adminId || data?.admin?._id,
            admin: data?.admin,
            userId: data?.userId || data?.admin?.user_id,
            detectionType,
            category: detectionType || data?.incidentType || data?.message || 'System',
        };
    }

    // Optional detection confidence, added here (every incident mail funnels
    // through _sendAndTrack) instead of editing 18 near-identical templates.
    // Subject always carries it; the body row lands next to "Time of Incident"
    // in the table-based templates. Non-incident mails have no such field -> no-op.
    // ponytail: string injection, not a template refactor. Rework the templates
    // into one shared layout if more fields ever need this treatment.
    _withConfidence(email, args = []) {
        const conf = args[1]?.ConfidenceScoreInPercentage;
        if (conf === null || conf === undefined) return;
        email.subject = `${email.subject} | Confidence: ${conf}%`;
        if (typeof email.html === 'string') {
            // Two row layouts exist across the templates (two-cell label/value
            // tables, and single-cell "<strong>Label:</strong> value" ones);
            // colspan=2 renders correctly in both.
            email.html = email.html.replace(
                /(<strong>\s*(?:Time of Incident|Dispatch Exit Time):?\s*<\/strong>[\s\S]*?<\/tr>)/i,
                `$1
  <tr>
  <td colspan="2" style="font-size:14px;padding:6px 10px; color: #626262;">
  <strong style="color:#000;">Confidence:</strong> ${conf}%
  </td>
  </tr>`,
            );
        }
    }

    async _sendAndTrack(email, args = []) {
        this._withConfidence(email, args);
        try {
            const sendStatus = await sendGridMail.send(email);
            await trackOutboundEmail(email, sendStatus, this._emailMetadata(args));
            return sendStatus;
        } catch (error) {
            await trackFailedEmail(email, error, this._emailMetadata(args));
            throw error;
        }
    }

    async loiteringWithoutAuth(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: loiteringWithoutAuthTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async LoiteringWithAuth(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: LoiteringWithAuthIncident(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async unauthorizedAccess(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: unauthorizedAccessIncident(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async LineCrossingAuth(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: LineCrossingAuthIncident(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async motionDetectionAuth(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: motionDetectionAuthTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }



    async genericObjectDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: genericObjectDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async countVehicles(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: countVehiclesTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async countPersons(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: countPersonsTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async personDetected(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] Person Detected${data?.count ? ` (${data.count})` : ''} – ${data?.incidentName || 'Person Detection'} | Severity: ${data?.severity || 'low'}`,
            html: personDetectedTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async verifyEmail(userEmail, verificationLink) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: userEmail,
            subject: 'Confirm your alert subscription',
            html: verifyEmailTemplate(verificationLink),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }
    async sendForgotPasswordEmail(userEmail, userName, resetLink) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: userEmail,
            subject: 'Password Reset Request',
            html: forgotPasswordTemplate(userName, resetLink),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async sendDomainIp(domainName, ip, port) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: config.get('domainPoint.email'),
            subject: 'New Domain Pointing Request',
            html: domainTemplate(domainName, ip, port),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }


    async crowdDetection(emailAddresses, data, detectionType, nvrData, channelData) {

        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: crowdDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        console.log(sendStatus, 'sendStatus');

        return sendStatus;
    }

    async personalProtectiveEquipment(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: personalProtectiveEquipmentTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async lightDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: lightDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async doorDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: doorDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async bagDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: bagDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async vehicleDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: vehicleDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);

        return sendStatus;
    }

    async vehicleObstruction(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: vehicleObstructionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);

        return sendStatus;
    }
    async entryLog(emailAddresses, data, nvrData, channelData) {
        sendGridMail.setApiKey(config.get("sendgrid.key"));
        const email = {
            from: {
                name: config.get("sendgrid.name"),
                email: config.get("sendgrid.email"),
            },
            to: emailAddresses,
            subject: `[Notification] Entry Log detected for ${data?.user?.firstName} ${data?.user?.lastName}`,
            html: entryLogTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }
    async vehicleLog(emailAddresses, data, nvrData, channelData) {
        sendGridMail.setApiKey(config.get("sendgrid.key"));
        const email = {
            from: {
                name: config.get("sendgrid.name"),
                email: config.get("sendgrid.email"),
            },
            to: emailAddresses,
            subject: `[Notification] Vehicle Entry detected: ${data?.vehicle?.vehicleNumber}`,
            html: vehicleLogTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async deskAbsence(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: deskAbsenceTemplate(data, nvrData, channelData),
        };
        // console.log(deskAbsenceTemplate(data,nvrData,channelData),'deskAbsenceTemplate(data,nvrData,channelData)');

        let sendStatus = await this._sendAndTrack(email, arguments);

        return sendStatus;
    }

    async guardAbsence(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: guardAbsenceTemplate(data, nvrData, channelData),
        };
        // console.log(deskAbsenceTemplate(data,nvrData,channelData),'deskAbsenceTemplate(data,nvrData,channelData)');

        let sendStatus = await this._sendAndTrack(email, arguments);

        return sendStatus;
    }

    async conveyorDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: conveyorDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async crusherDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: crusherDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async waterSpillageDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: waterSpillageDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async sendPasswordUpdatedEmail(userEmail, userName, email, newPassword) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const mailOptions = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: userEmail,
            subject: 'Your Password Has Been Updated',
            html: passwordUpdatedTemplate(userName, email, newPassword, new Date()),
        };
        let sendStatus = await this._sendAndTrack(mailOptions, arguments);
        return sendStatus;
    }


    async vehicleTypeDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: vehicleTypeDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async loiteringDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: loiteringDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }

    async tableOccupancyDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: tableOccupancyDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }
        async vehicleObstruction(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: vehicleObstructionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);

        return sendStatus;
    }

    async foodServicePPEDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: foodServicePPEDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }


    
    async mobilePhoneDetection(emailAddresses, data, detectionType, nvrData, channelData) {
        sendGridMail.setApiKey(config.get('sendgrid.key'));
        const email = {
            from: {
                name: config.get('sendgrid.name'),
                email: config.get('sendgrid.email'),
            },
            to: emailAddresses,
            subject: `[Incident Alert] ${data?.incidentName} Detected – ${data?.incidentType} | Severity: ${data?.severity}`,
            html: mobilePhoneDetectionTemplate(data, nvrData, channelData),
        };
        let sendStatus = await this._sendAndTrack(email, arguments);
        return sendStatus;
    }
}

export default new MailHelper();
