import { mkdirSync } from "fs";
import os from "os";
import path from "path";
import dotenv from 'dotenv';
import schedule from 'node-schedule';

import { getLogger } from './util/Log';
import { BackupManager, FullDumpConfiguration } from './BackupManager';
import { NullFileManager } from './FileManager';
import { PosixShell } from "./Shell";

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
const shell = new PosixShell();
const backupManager = new BackupManager({
    fileManager: new NullFileManager(),
    logDirectory,
    password: "secret",
    workingDirectory,
    fullBackupSchedule: "* * 0 * * *",
    fullDumpConfiguration,
    shell
});

let running = false;
const processLogsDirectory = async () => {
    if (!running) {
        running = true;
        try {
            const nowDate = now();
            logger.info(`Triggering backup at ${nowDate.toISOString()}...`);
            await backupManager.trigger(nowDate);
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

function now(): Date {
    const date = new Date();
    date.setMilliseconds(0);
    return date;
}

schedule.scheduleJob('* 0 * * * *', processLogsDirectory);
