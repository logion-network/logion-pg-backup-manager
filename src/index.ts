import { AsyncTask, SimpleIntervalJob, ToadScheduler } from 'toad-scheduler';
import dotenv from 'dotenv';

import { getLogger } from './util/Log';
import { LogsProcessor } from './LogsProcessor';

dotenv.config()
const logger = getLogger();

const logsProcessor = new LogsProcessor({
    sqlSink: (sql) => {
        if(sql) {
            console.log(sql);
        }
        return Promise.resolve();
    },
    filePostProcessor: () => Promise.resolve()
});

const logsDir = process.env.LOG_DIRECTORY;
if(!logsDir) {
    throw new Error("No logs directory given");
}

logger.info(`Scheduling processing of directory ${logsDir}...`);
let running = false;
const processLogsDirectory = async () => {
    if (!running) {
        running = true;
        try {
            await logsProcessor.process(logsDir);
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
