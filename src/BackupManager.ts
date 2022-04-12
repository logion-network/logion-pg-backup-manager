import { FileHandle, open } from "fs/promises";
import { DateTime } from "luxon";

import { BackupManagerCommand, BackupManagerConfiguration } from "./Command";
import { Backup } from "./Backup";
import { getLogger } from "./util/Log";

const logger = getLogger();

export const DEFAULT_COMMAND_NAME = "Default";

export const COMMAND_NAMES = [ DEFAULT_COMMAND_NAME, "Backup" ];

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
        } else {
            throw new Error(`Unsupported command ${commandName}`);
        }

        logger.info(`Executing ${commandName} command...`);
        await command.trigger(date);

        if(commandName !== DEFAULT_COMMAND_NAME) {
            logger.info("Resetting command file...");
            await this.resetCommandFile();
        }
    }

    private async readCommandName(): Promise<string> {
        let file: FileHandle;
        try {
            file = await open(this.configuration.commandFile, 'r');
        } catch {
            return DEFAULT_COMMAND_NAME;
        }

        try {
            const name = await file.readFile({encoding: "utf-8"});
            if(COMMAND_NAMES.includes(name)) {
                return name;
            } else {
                throw new Error(`Invalid command name ${name}`)
            }
        } finally {
            await file.close();
        }
    }

    private async resetCommandFile() {
        const file = await open(this.configuration.commandFile, 'w');
        await file.write(DEFAULT_COMMAND_NAME, null, "utf-8");
        await file.close();
    }
}
