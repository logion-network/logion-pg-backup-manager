import { FileHandle, open } from "fs/promises";
import { DateTime } from "luxon";

import { BackupManagerCommand, BackupManagerConfiguration } from "./Command";
import { Backup } from "./Backup";
import { getLogger } from "./util/Log";
import { Restore } from "./Restore";

const logger = getLogger();

export type CommandName = "Default" | "Backup" | "Restore";

export const DEFAULT_COMMAND_NAME: CommandName = "Default";

export const COMMAND_NAMES: CommandName[] = [ DEFAULT_COMMAND_NAME, "Backup", "Restore" ];

export const ERROR_FLAG_SET = "1";

export const ERROR_FLAG_UNSET = "0";

export class BackupManager {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    readonly configuration: BackupManagerConfiguration;

    async trigger(date: DateTime) {
        let command: BackupManagerCommand;
        let commandName: string = await this.readCommandName();
        if(commandName === "Backup" || commandName === DEFAULT_COMMAND_NAME) {
            command = new Backup(this.configuration);
        } else if(commandName === "Restore") {
            command = new Restore(this.configuration);
        } else {
            throw new Error(`Unsupported command ${commandName}`);
        }

        logger.info(`Executing ${commandName} command...`);
        await command.trigger(date);

        if(commandName !== DEFAULT_COMMAND_NAME) {
            logger.info("Resetting command file...");
            await this.resetCommandFile();
        }

        logger.info("Resetting error flag...");
        await this.setErrorFlag(false);
    }

    private async readCommandName(): Promise<string> {
        let file: FileHandle;
        try {
            file = await open(this.configuration.commandFile, 'r');
        } catch {
            return DEFAULT_COMMAND_NAME;
        }

        try {
            const content = await file.readFile({encoding: "utf-8"});
            const name = content.trim();
            if(COMMAND_NAMES.includes(name as CommandName)) {
                return name;
            } else {
                throw new Error(`Invalid command name ${name}`)
            }
        } finally {
            await file.close();
        }
    }

    private async resetCommandFile() {
        await this.resetFile(this.configuration.commandFile, DEFAULT_COMMAND_NAME);
    }

    private async resetFile(path: string, content: string) {
        const file = await open(path, 'w');
        await file.write(content, null, "utf-8");
        await file.close();
    }

    async notifyFailure(dateTime: DateTime, error: any) {
        const errorFlag = await this.readErrorFlag();
        if(!errorFlag) {
            await this.setErrorFlag(true);
            const mailer = this.configuration.mailer;
            try {
                await mailer.sendMail({
                    to: this.configuration.mailTo,
                    subject: "Backup manager failure",
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
