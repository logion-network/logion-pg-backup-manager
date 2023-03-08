import { DateTime } from "luxon";
import { CommandFile } from "./CommandFile";
import { ErrorFile } from "./ErrorFile";
import { FileManager } from "./FileManager";
import { Journal } from "./Journal";
import { Mailer } from "./Mailer";
import { Shell } from "./Shell";

export const APP_NAME = "pg-backup-manager";

export interface FullDumpConfiguration {
    readonly host: string;
    readonly user: string;
    readonly database: string;
}

export interface BackupManagerConfiguration {
    readonly workingDirectory: string;
    readonly logDirectory: string;
    readonly fileManager: FileManager;
    readonly password: string;
    readonly shell: Shell;
    readonly fullDumpConfiguration: FullDumpConfiguration;
    readonly journal: Journal;
    readonly maxFullBackups: number;
    readonly mailer: Mailer;
    readonly mailTo: string;
    readonly triggerCron: string;
    readonly fullBackupTriggerCron: string;
    readonly commandFile: CommandFile;
    readonly errorFile: ErrorFile;
}

export abstract class BackupManagerCommand {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    readonly configuration: BackupManagerConfiguration;

    abstract trigger(date: DateTime): Promise<void>;

    abstract get name(): string;
}
