import dotenv from 'dotenv';
import { mkdirSync } from "fs";
import { DateTime, Duration } from "luxon";
import schedule from 'node-schedule';
import os from "os";
import path from "path";

import { getLogger } from './util/Log';
import { BackupManager, FullDumpConfiguration } from './BackupManager';
import { NullFileManager } from './FileManager';
import { DefaultShell } from "./Shell";

dotenv.config()
const logger = getLogger();

const logDirectory = process.env.LOG_DIRECTORY;
if(!logDirectory) {
    throw new Error("No logs directory given");
}

const workingDirectory = path.join(os.tmpdir(), "logion-pg-backup-manager");
mkdirSync(workingDirectory, {recursive: true});

const fullDumpConfiguration: FullDumpConfiguration = {
    user: "postgres",
    database: "postgres",
    host: "localhost"
};
const shell = new DefaultShell();
const backupManager = new BackupManager({
    fileManager: new NullFileManager(),
    logDirectory,
    password: "secret",
    workingDirectory,
    maxDurationSinceLastFullBackup: Duration.fromISOTime("24:00"),
    fullDumpConfiguration,
    shell,
    journalFile: path.join(workingDirectory, 'journal'),
    maxFullBackups: 30
});

let running = false;
const processLogsDirectory = async () => {
    if (!running) {
        running = true;
        try {
            const now = DateTime.now().set({millisecond: 0});
            logger.info(`Triggering backup at ${now.toISO()}...`);
            await backupManager.trigger(now);
        } catch (e: any) {
            logger.error(e.message);
            logger.debug(e.stack);
        } finally {
            running = false;
        }
    } else {
        return Promise.resolve();
    }
};

schedule.scheduleJob('* * * * * *', processLogsDirectory); // Every hour
