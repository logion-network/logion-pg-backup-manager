import { mkdirSync } from "fs";
import os from "os";
import path from "path";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from 'toad-scheduler';
import dotenv from 'dotenv';

import { getLogger } from './util/Log';
import { BackupManager } from './BackupManager';
import { NullFileManager } from './FileManager';

dotenv.config()
const logger = getLogger();

const logDirectory = process.env.LOG_DIRECTORY;
if(!logDirectory) {
    throw new Error("No logs directory given");
}

const workingDirectory = path.join(os.tmpdir(), "logion-pg-backup-manager");
mkdirSync(workingDirectory, {recursive: true});

const backupManager = new BackupManager({
    fileManager: new NullFileManager(),
    logDirectory,
    password: "secret",
    workingDirectory
});

let running = false;
const processLogsDirectory = async () => {
    if (!running) {
        running = true;
        try {
            const sequence = new Date().toISOString();
            logger.info(`Triggering backup at ${sequence}...`);
            await backupManager.trigger(sequence.toString());
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

const task = new AsyncTask(
    'Process logs directory',
    processLogsDirectory,
    (err: Error) => {
        running = false;
        logger.error(err.message)
        logger.debug(err.stack);
    }
);
const job = new SimpleIntervalJob({ seconds: 1 }, task);

const scheduler = new ToadScheduler();
scheduler.addSimpleIntervalJob(job);
