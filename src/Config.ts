import dotenv from 'dotenv';
import { mkdirSync } from 'fs';
import { Duration } from 'luxon';
import path from 'path';

import { BackupManager, BackupManagerConfiguration, FullDumpConfiguration } from "./BackupManager";
import { DefaultFileManager, DefaultFileManagerConfiguration } from './FileManager';
import { Mailer } from './Mailer';
import { DefaultShell } from './Shell';

dotenv.config()

export function buildBackupManagerFromConfig(): BackupManager {
    const logDirectory = process.env.LOG_DIRECTORY;
    if(!logDirectory) {
        throw new Error("No logs directory given");
    }

    const workingDirectory = process.env.WORKING_DIRECTORY!;
    mkdirSync(workingDirectory, {recursive: true});

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
    });
    const fileManagerConfiguration: DefaultFileManagerConfiguration = {
        shell,
        ipfsClusterCtl: process.env.IPFS_CLUSTER_CTL!,
        ipfsHost: process.env.IPFS_HOST!,
        minReplica: Number(process.env.IPFS_MIN_REPLICA!),
        maxReplica: Number(process.env.IPFS_MAX_REPLICA!),
    };
    const backupManagerConfiguration: BackupManagerConfiguration = {
        fileManager: new DefaultFileManager(fileManagerConfiguration),
        logDirectory,
        password: process.env.PASSWORD!,
        workingDirectory,
        maxDurationSinceLastFullBackup: Duration.fromISOTime(process.env.MAX_DURATION_SINCE_LAST_FULL_BACKUP!),
        fullDumpConfiguration,
        shell,
        journalFile: path.join(workingDirectory, 'journal.txt'),
        maxFullBackups: Number(process.env.MAX_FULL_BACKUPS!),
        mailer,
        mailTo: process.env.MAIL_TO!,
        triggerCron: process.env.TRIGGER_CRON!,
    };
    return new BackupManager(backupManagerConfiguration);
}
