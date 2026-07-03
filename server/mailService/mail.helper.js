
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
class MailHelper {
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);

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
        let sendStatus = await sendGridMail.send(email);

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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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

        let sendStatus = await sendGridMail.send(email);

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

        let sendStatus = await sendGridMail.send(email);

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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(mailOptions);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);

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
        let sendStatus = await sendGridMail.send(email);
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
        let sendStatus = await sendGridMail.send(email);
        return sendStatus;
    }
}

export default new MailHelper();