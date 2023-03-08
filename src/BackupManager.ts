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
        const command = await this.buildCommand();

        const commandName = command.name;
        if(commandName === Restore.NAME) {
            await this.configuration.commandFile.resetCommandFile(Pause.NAME);
        } else if(commandName !== DEFAULT_COMMAND_NAME && commandName !== Pause.NAME) {
            logger.info("Resetting command file...");
            await this.configuration.commandFile.resetCommandFile(Backup.NAME);
        }

        logger.info(`Executing ${commandName} command...`);
        await command.trigger(date);

        logger.info("Resetting error flag...");
        await this.configuration.errorFile.setErrorFlag(false);
    }

    private async buildCommand(): Promise<BackupManagerCommand> {
        const commandName = await this.configuration.commandFile.readCommandName();
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

    async notifyFailure(jobName: string, dateTime: DateTime, error: any) {
        const errorFlag = await this.configuration.errorFile.readErrorFlag();
        if(!errorFlag) {
            await this.configuration.errorFile.setErrorFlag(true);
            const mailer = this.configuration.mailer;
            try {
                await mailer.sendFailureMail({
                    to: this.configuration.mailTo,
                    jobName,
                    dateTime,
                    error: error.message
                });
            } catch(notifyError: any) {
                logger.error(`Failed notifying error: ${notifyError.message}`)
            }
        } else {
            logger.info(`Error already notified: ${error.message}`);
        }
    }
}
