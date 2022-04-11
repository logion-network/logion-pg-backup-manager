import { createTransport } from "nodemailer";
import { Options as TransportOptions } from "nodemailer/lib/smtp-connection";
import Mail, { Attachment } from "nodemailer/lib/mailer";

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    attachments?: Attachment[];
}

export class Mailer {

    constructor(from: string, transportOptions: TransportOptions) {
        this.from = from;
        this.transportOptions = transportOptions;
    }

    private readonly from: string;

    private readonly transportOptions: TransportOptions;

    async sendMail(message: MailMessage) {
        const transport = createTransport(this.transportOptions);
        const mail: Mail.Options = {
            ...message,
            from: this.from,
        }
        await transport.sendMail(mail);
    }
}
