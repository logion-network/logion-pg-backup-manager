import { FileHandle, open } from "fs/promises";
import { DateTime } from "luxon";

import { BackupManagerCommand, BackupManagerConfiguration } from "./Command";
import { Backup } from "./Backup";
import { getLogger } from "./util/Log";
import { Restore } from "./Restore";
import { Pause } from "./Pause";
import { FullBackup } from "./FullBackup";

const logger = getLogger();

export const DEFAULT_COMMAND_NAME = "Default";

export const COMMAND_NAMES = [ DEFAULT_COMMAND_NAME, Backup.NAME, FullBackup.NAME, Restore.NAME, Pause.NAME ];

export const ERROR_FLAG_SET = "1";

export const ERROR_FLAG_UNSET = "0";

export class BackupManager {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    readonly configuration: BackupManagerConfiguration;

    async trigger(date: DateTime) {
        const command = await this.buildCommand();

        const commandName = command.name;
        if(commandName === Restore.NAME) {
            await this.resetCommandFile(Pause.NAME);
        } else if(commandName !== DEFAULT_COMMAND_NAME && commandName !== Pause.NAME) {
            logger.info("Resetting command file...");
            await this.resetCommandFile(Backup.NAME);
        }

        logger.info(`Executing ${commandName} command...`);
        await command.trigger(date);

        logger.info("Resetting error flag...");
        await this.setErrorFlag(false);
    }

    private async buildCommand(): Promise<BackupManagerCommand> {
        const commandName = await this.readCommandName();
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

    private async readCommandName(): Promise<string | undefined> {
        let file: FileHandle;
        try {
            file = await open(this.configuration.commandFile, 'r');
        } catch {
            return undefined;
        }

        try {
            const content = await file.readFile({encoding: "utf-8"});
            const name = content.trim();
            if(COMMAND_NAMES.includes(name)) {
                return name;
            } else {
                throw new Error(`Invalid command name ${name}`)
            }
        } finally {
            await file.close();
        }
    }

    async triggerFullBackup() {
        await this.resetCommandFile("FullBackup");
    }

    private async resetCommandFile(commandName: string) {
        await this.resetFile(this.configuration.commandFile, commandName);
    }

    private async resetFile(path: string, content: string) {
        const file = await open(path, 'w');
        await file.write(content, null, "utf-8");
        await file.close();
    }

    async notifyFailure(jobName: string, dateTime: DateTime, error: any) {
        const errorFlag = await this.readErrorFlag();
        if(!errorFlag) {
            await this.setErrorFlag(true);
            const mailer = this.configuration.mailer;
            try {
                await mailer.sendMail({
                    to: this.configuration.mailTo,
                    subject: `Backup manager failure: ${ jobName }`,
                    text: `Trigger failed on ${dateTime.toISO()}, see logs for more information (${error.message}).`
                });
            } catch(notifyError: any) {
                logger.error(`Failed notifying error: ${notifyError.message}`)
            }
        } else {
            logger.info(`Error already notified: ${error.message}`);
        }
    }

    private async readErrorFlag(): Promise<boolean> {
        let file: FileHandle;
        try {
            file = await open(this.configuration.errorFile, 'r');
        } catch {
            return false;
        }

        try {
            const content = await file.readFile({encoding: "utf-8"});
            const errorFlag = content.trim();
            return errorFlag === ERROR_FLAG_SET;
        } finally {
            await file.close();
        }
    }

    private async setErrorFlag(flag: boolean) {
        await this.resetFile(this.configuration.errorFile, flag ? ERROR_FLAG_SET : ERROR_FLAG_UNSET);
    }
}
