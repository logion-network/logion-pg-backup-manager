import dotenv from 'dotenv';
import { DateTime } from "luxon";
import schedule from 'node-schedule';

import { getLogger, setLogLevel } from './util/Log';

dotenv.config()

setLogLevel(process.env.LOG_LEVEL || "info");
main();

async function main() {
    const logger = getLogger();

    const { buildBackupManagerFromConfig } = await import("./Config");

    const backupManager = buildBackupManagerFromConfig();

    let running = false;
    const doBackup = async () => {
        if (!running) {
            running = true;
            try {
                const now = DateTime.now().set({millisecond: 0});
                logger.info(`Triggering at ${now.toISO()}...`);
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

    logger.info("");
    logger.info("************************************");
    logger.info("* Logion PostgreSQL Backup Manager *");
    logger.info("************************************");
    logger.info("");

    logger.info(`Trigger schedule: ${backupManager.configuration.triggerCron}`);
    schedule.scheduleJob(backupManager.configuration.triggerCron, doBackup);
}
