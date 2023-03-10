import { mkdirSync } from 'fs';
import path from 'path';

import { BackupManager } from "./BackupManager";
import { BackupManagerConfiguration, FullDumpConfiguration } from './Command';
import { CommandFile } from './CommandFile';
import { ErrorFile } from './ErrorFile';
import { DefaultFileManager, DefaultFileManagerConfiguration } from './FileManager';
import { Journal } from './Journal';
import { Mailer } from './Mailer';
import { DefaultShell } from './Shell';

export async function getBackupManagerConfig(validateAndSetup: boolean): Promise<BackupManagerConfiguration> {
    const logDirectory = process.env.LOG_DIRECTORY;
    if(validateAndSetup && !logDirectory) {
        throw new Error("No logs directory given");
    }

    const workingDirectory = process.env.WORKING_DIRECTORY;
    if(validateAndSetup && workingDirectory) {
        mkdirSync(workingDirectory, {recursive: true});
    }

    const fullDumpConfiguration: FullDumpConfiguration = {
        user: process.env.PG_USER!,
        database: process.env.PG_DATABASE!,
        host: process.env.PG_HOST!,
    };
    const shell = new DefaultShell();
    const mailer = new Mailer({
        from: process.env.SMTP_FROM!,
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "465", 10),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWD,
            method: 'login'
        },
        secure: process.env.SMTP_SECURE !== "false",
        logger: process.env.SMTP_LOGGER === "true",
        enabled: process.env.SMTP_ENABLED === "true",
        subjectPrefix: process.env.MAIL_SUBJECT_PREFIX || "",
    });
    const fileManagerConfiguration: DefaultFileManagerConfiguration = {
        shell,
        ipfsClusterCtl: process.env.IPFS_CLUSTER_CTL!,
        ipfsClusterHost: process.env.IPFS_CLUSTER_HOST!,
        minReplica: Number(process.env.IPFS_MIN_REPLICA!),
        maxReplica: Number(process.env.IPFS_MAX_REPLICA!),
        ipfs: process.env.IPFS!,
        ipfsHost: process.env.IPFS_HOST!,
    };

    const actualWorkingDirectory = workingDirectory || "work";
    return {
        fileManager: new DefaultFileManager(fileManagerConfiguration),
        logDirectory: logDirectory || "/var/lib/pgsql/data/logs",
        password: process.env.ENC_PASSWORD!,
        workingDirectory: actualWorkingDirectory,
        fullDumpConfiguration,
        shell,
        journal: await Journal.read(path.join(actualWorkingDirectory, 'journal.txt')),
        maxFullBackups: Number(process.env.MAX_FULL_BACKUPS!),
        mailer,
        mailTo: process.env.MAIL_TO!,
        triggerCron: process.env.TRIGGER_CRON!,
        fullBackupTriggerCron: process.env.FULL_BACKUP_TRIGGER_CRON!,
        commandFile: new CommandFile(path.join(actualWorkingDirectory, 'command.txt')),
        errorFile: new ErrorFile(path.join(actualWorkingDirectory, 'error.txt')),
        restoredAndClose: process.env.RESTORE_AND_CLOSE === "true",
    };
}

export async function buildBackupManagerFromConfig(): Promise<BackupManager> {
    const backupManagerConfiguration = await getBackupManagerConfig(true);
    return new BackupManager(backupManagerConfiguration);
}
