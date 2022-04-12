import { DateTime } from "luxon";
import schedule from 'node-schedule';

import { getLogger } from './util/Log';
import { buildBackupManagerFromConfig } from "./Config";

const logger = getLogger();
const backupManager = buildBackupManagerFromConfig();

let running = false;
const doBackup = async () => {
    if (!running) {
        running = true;
        try {
            const now = DateTime.now().set({millisecond: 0});
            logger.info(`Triggering backup at ${now.toISO()}...`);
            await backupManager.trigger(now);
        } catch (e: any) {
            logger.error(e.message);
            logger.error(e.stack);

            const mailer = backupManager.configuration.mailer;
            await mailer.sendMail({
                to: backupManager.configuration.mailTo,
                subject: "Backup failure",
                text: `Unable to create backup, see logs for more information: ${e.message}`
            });
        } finally {
            running = false;
        }
    } else {
        return Promise.resolve();
    }
};

logger.info(`Trigger CRON: ${backupManager.configuration.triggerCron}.`);
schedule.scheduleJob(backupManager.configuration.triggerCron, doBackup);
