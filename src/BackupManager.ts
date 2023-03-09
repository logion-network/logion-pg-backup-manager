import { DateTime } from "luxon";

import { BackupManagerCommand, BackupManagerConfiguration } from "./Command";
import { Backup } from "./Backup";
import { getLogger } from "./util/Log";
import { Restore } from "./Restore";
import { Pause } from "./Pause";
import { FullBackup } from "./FullBackup";
import { DEFAULT_COMMAND_NAME } from "./CommandFile";

const logger = getLogger();

export class BackupManager {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    readonly configuration: BackupManagerConfiguration;

    async trigger(date: DateTime) {
        if(!this.configuration.restoredAndClose) {
            await this.handleFailedEmail(date);
        }

        const command = await this.buildCommand();
        const commandName = command.name;
        if(commandName === Restore.NAME) {
            await this.configuration.commandFile.setCommandName(Pause.NAME);
        } else if(commandName !== DEFAULT_COMMAND_NAME && commandName !== Pause.NAME) {
            logger.info("Resetting command file...");
            await this.configuration.commandFile.setCommandName(Backup.NAME);
        }

        logger.info(`Executing ${commandName} command...`);
        await command.trigger(date);

        logger.info("Resetting error flag...");
        await this.configuration.errorFile.setErrorState("None");
    }

    private async handleFailedEmail(dateTime: DateTime) {
        const errorState = await this.configuration.errorFile.getErrorState();
        if(errorState === "EmailJournalFailure") {
            logger.info("Retrying to send journal...");
            try {
                await this.configuration.mailer.sendJournalMail(this.configuration.mailTo, this.configuration.journal);
                await this.configuration.errorFile.setErrorState("None");
            } catch(e) {
                logger.error("Failed to send journal on retry");
            }
        } else if(errorState === "EmailErrorFailure") {
            logger.info("Retrying to send failure...");
            try {
                await this.configuration.mailer.sendFailureMail({
                    to: this.configuration.mailTo,
                    dateTime,
                    error: "see logs",
                    jobName: "see logs",
                });
                await this.configuration.errorFile.setErrorState("BackupFailure");
            } catch(e) {
                logger.error("Failed to send failure on retry");
            }
        }
    }

    private async buildCommand(): Promise<BackupManagerCommand> {
        if(this.configuration.restoredAndClose) {
            return new Restore(this.configuration);
        } else {
            const commandName = await this.configuration.commandFile.getCommandName();
            const journal = this.configuration.journal;
            if(commandName === FullBackup.NAME || journal.getLastFullBackup() === undefined) {
                return new FullBackup(this.configuration);
            } else if(commandName === Backup.NAME || commandName === DEFAULT_COMMAND_NAME) {
                return new Backup(this.configuration);
            } else if(commandName === Restore.NAME) {
                return new Restore(this.configuration);
            } else if(commandName === Pause.NAME) {
                return new Pause(this.configuration);
            } else {
                throw new Error(`Unsupported command ${commandName}`);
            }
        }
    }

    async notifyFailure(jobName: string, dateTime: DateTime, error: any) {
        const errorFlag = await this.configuration.errorFile.getErrorState();
        if(errorFlag !== "BackupFailure" && errorFlag !== "EmailErrorFailure") {
            await this.configuration.errorFile.setErrorState("BackupFailure");
            const mailer = this.configuration.mailer;
            try {
                await mailer.sendFailureMail({
                    to: this.configuration.mailTo,
                    jobName,
                    dateTime,
                    error: error.message
                });
            } catch(notifyError: any) {
                logger.error(`Failed notifying error: ${notifyError.message}`);
                await this.configuration.errorFile.setErrorState("EmailErrorFailure");
            }
        } else {
            logger.info(`Error already notified: ${error.message}`);
        }
    }
}
