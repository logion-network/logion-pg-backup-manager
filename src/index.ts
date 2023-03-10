import dotenv from 'dotenv';
import { DateTime } from "luxon";
import schedule from 'node-schedule';

import { getLogger, setLogLevel } from './util/Log';
import { FullBackup } from './FullBackup';
import { MailerException } from './Mailer';
import { Logger } from 'winston';
import { BackupManager } from './BackupManager';

dotenv.config()

setLogLevel(process.env.LOG_LEVEL || "info");
main();

type JobName = 'Idle' | 'Backup' | 'QueueFullBackup';

async function main() {
    const logger = getLogger();
    const { buildBackupManagerFromConfig } = await import("./Config");
    const backupManager = await buildBackupManagerFromConfig();

    logger.info("");
    logger.info("************************************");
    logger.info("* Logion PostgreSQL Backup Manager *");
    logger.info("************************************");
    logger.info("");

    if(backupManager.configuration.restoredAndClose) {
        await restore({ logger, backupManager });
    } else {
        await runService({ logger, backupManager });
    }
}

async function restore(args: {
    logger: Logger,
    backupManager: BackupManager,
}) {
    const { logger, backupManager } = args;

    await backupManager.configuration.commandFile.setCommandName("Restore");
    try {
        await backupManager.trigger(DateTime.now());
    } catch(e: any) {
        logger.error(e.message);
        logger.error(e.stack);
    }
}

async function runService(args: {
    logger: Logger,
    backupManager: BackupManager,
}) {
    const { logger, backupManager } = args;

    let running: JobName = 'Idle';
    let fullBackupSkipped = false;
    const doJob = async (jobName: JobName, trigger: (dateTime: DateTime) => Promise<void>) => {
        running = jobName;
        const now = DateTime.now().set({ millisecond: 0 });
        try {
            logger.info(`Triggering ${ jobName } at ${ now.toISO() }...`);
            await trigger(now);
        } catch (e: any) {
            logger.error(e.message);
            logger.error(e.stack);

            if(e instanceof MailerException) {
                await backupManager.configuration.errorFile.setErrorState("EmailJournalFailure");
            } else {
                await backupManager.notifyFailure(jobName, now, e);
            }
        } finally {
            running = 'Idle';
        }
    };

    const runCommand = async () => {
        if (running === 'Idle') {
            if(fullBackupSkipped) {
                await doQueueFullBackupJob();
                fullBackupSkipped = false;
            } else {
                await doJob('Backup', (now) => backupManager.trigger(now));
            }
        } else {
            return Promise.resolve();
        }
    };

    async function doQueueFullBackupJob() {
        await doJob('QueueFullBackup', () => backupManager.configuration.commandFile.setCommandName(FullBackup.NAME));
    }

    const queueFullBackup = async () => {
        if (running === 'Idle') {
            await doQueueFullBackupJob();
        } else {
            fullBackupSkipped = true;
            return Promise.resolve();
        }
    };

    logger.info(`Trigger schedule: ${ backupManager.configuration.triggerCron }`);
    schedule.scheduleJob(backupManager.configuration.triggerCron, runCommand);

    logger.info(`Full Backup Trigger schedule: ${ backupManager.configuration.fullBackupTriggerCron }`);
    schedule.scheduleJob(backupManager.configuration.fullBackupTriggerCron, queueFullBackup);
}
