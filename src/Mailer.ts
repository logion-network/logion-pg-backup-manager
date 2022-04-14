import { createTransport } from "nodemailer";
import { Options as TransportOptions } from "nodemailer/lib/smtp-connection";
import Mail, { Attachment } from "nodemailer/lib/mailer";
import { getLogger } from "./util/Log";

const logger = getLogger();

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    attachments?: Attachment[];
}

export interface MailerConfiguration extends TransportOptions {
    from: string;
    enabled: boolean;
    subjectPrefix: string;
}

export class Mailer {

    constructor(configuration: MailerConfiguration) {
        this.configuration = configuration;
    }

    private readonly configuration: MailerConfiguration;

    async sendMail(message: MailMessage) {
        let subject;
        if(this.configuration.subjectPrefix) {
            subject = `${this.configuration.subjectPrefix} ${message.subject}`;
        } else {
            subject = message.subject;
        }
        if(!this.configuration.enabled) {
            logger.info(`[Mailer disabled] Subject: ${subject}`);
            logger.info(`[Mailer disabled] Body: ${message.text}`);
            if(message.attachments) {
                for(let i = 0; i < message.attachments.length; ++i) {
                    logger.info(`[Mailer disabled] Attachment[${i}]: ${message.attachments[i].path}`);
                }
            }
            return;
        }
        const transport = createTransport(this.configuration);
        const mail: Mail.Options = {
            ...message,
            subject,
            from: this.configuration.from,
        }
        await transport.sendMail(mail);
    }
}
