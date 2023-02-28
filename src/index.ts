import dotenv from 'dotenv';
import { DateTime } from "luxon";
import schedule from 'node-schedule';

import { getLogger, setLogLevel } from './util/Log';
import { BackupManager } from "./BackupManager.js";

dotenv.config()

setLogLevel(process.env.LOG_LEVEL || "info");
main();

type JobName = 'Idle' | 'Backup' | 'TriggerFullBackup';

async function main() {
    const logger = getLogger();

    const { buildBackupManagerFromConfig } = await import("./Config");

    const backupManager = buildBackupManagerFromConfig();

    let running: JobName = 'Idle';
    const doJob = async (jobName: JobName, trigger: (backupManager: BackupManager, dateTime: DateTime) => Promise<void>) => {
        running = jobName;
        const now = DateTime.now().set({ millisecond: 0 });
        try {
            logger.info(`Triggering ${ jobName } at ${ now.toISO() }...`);
            await trigger(backupManager, now);
        } catch (e: any) {
            logger.error(e.message);
            logger.error(e.stack);

            await backupManager.notifyFailure(jobName, now, e);
        } finally {
            running = 'Idle';
        }
    };

    const doBackup = async () => {
        if (running === 'Idle') {
            await doJob('Backup', (backupManager, now) => backupManager.trigger(now))
        } else {
            return Promise.resolve();
        }
    };

    const triggerFullBackup = async () => {
        if (running !== 'TriggerFullBackup') {
            await doJob('TriggerFullBackup', backupManager => backupManager.triggerFullBackup())
        } else {
            return Promise.resolve();
        }
    };

    logger.info("");
    logger.info("************************************");
    logger.info("* Logion PostgreSQL Backup Manager *");
    logger.info("************************************");
    logger.info("");

    logger.info(`Trigger schedule: ${ backupManager.configuration.triggerCron }`);
    schedule.scheduleJob(backupManager.configuration.triggerCron, doBackup);

    logger.info(`Full Backup Trigger schedule: ${ backupManager.configuration.fullBackupTriggerCron }`);
    schedule.scheduleJob(backupManager.configuration.fullBackupTriggerCron, triggerFullBackup);
}
