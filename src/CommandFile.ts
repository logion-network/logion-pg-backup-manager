import { Backup } from "./Backup";
import { FullBackup } from "./FullBackup";
import { Pause } from "./Pause";
import { Restore } from "./Restore";
import { StateFile } from "./StateFile";

export const DEFAULT_COMMAND_NAME = "Default";

export const COMMAND_NAMES = [ DEFAULT_COMMAND_NAME, Backup.NAME, FullBackup.NAME, Restore.NAME, Pause.NAME ];

export class CommandFile {

    constructor(path: string) {
        this.file = new StateFile(path);
    }

    private file: StateFile;

    async readCommandName(): Promise<string | undefined> {
        const name = await this.file.readFile();
        if(name === undefined) {
            return undefined;
        }

        if(COMMAND_NAMES.includes(name)) {
            return name;
        } else {
            throw new Error(`Invalid command name ${name}`)
        }
    }

    async resetCommandFile(commandName: string) {
        await this.file.resetFile(commandName);
    }
}
