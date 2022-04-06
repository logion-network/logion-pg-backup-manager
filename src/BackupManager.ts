import path from "path";
import cronParser, { SixtyRange, HourRange, DayOfTheMonthRange, MonthRange, DayOfTheWeekRange } from 'cron-parser';

import { EncryptedFileWriter } from './EncryptedFile';
import { FileManager } from "./FileManager";
import { LogsProcessor } from "./LogsProcessor";
import { Shell } from "./Shell";

export interface FullDumpConfiguration {
    host: string;
    user: string;
    database: string;
}

export interface BackupManagerConfiguration {
    workingDirectory: string;
    logDirectory: string;
    fileManager: FileManager;
    password: string;
    fullBackupSchedule: string;
    shell: Shell;
    fullDumpConfiguration: FullDumpConfiguration;
}

export class BackupManager {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    private configuration: BackupManagerConfiguration;

    async trigger(date: Date) {
        let backupFile: string;
        if(this.matches(this.configuration.fullBackupSchedule, date)) {
            backupFile = path.join(this.configuration.workingDirectory, `${date.toISOString()}-full.sql.enc`);
            const fullDumpConfiguration = this.configuration.fullDumpConfiguration;
            const dumpCommand = `pg_dump -F c -h ${fullDumpConfiguration.host} -U ${fullDumpConfiguration.user} ${fullDumpConfiguration.database} | openssl enc -aes-256-cbc -md sha512 -pbkdf2 -iter 100000 -pass pass:${this.configuration.password} > ${backupFile}`;
            await this.configuration.shell.exec(dumpCommand);
        } else {
            backupFile = path.join(this.configuration.workingDirectory, `${date.toISOString()}-delta.sql.enc`);
            const writer = new EncryptedFileWriter(this.configuration.password);
            await writer.open(backupFile);
            const logsProcessor = new LogsProcessor({
                sqlSink: async (sql) => {
                    if(sql) {
                        await writer.write(Buffer.from(sql, 'utf-8'));
                    } else {
                        return Promise.resolve();
                    }
                },
                filePostProcessor: async (file: string) => await this.configuration.fileManager.deleteFile(file)
            });
            await logsProcessor.process(this.configuration.logDirectory);
            await writer.close();
        }

        await this.configuration.fileManager.moveToIpfs(backupFile);
    }

    private matches(expression: string, date: Date): boolean {
        const {
            minute,
            hour,
            dayOfMonth,
            month,
            dayOfWeek
        } = cronParser.parseExpression(expression).fields;

        if (
            minute.includes(date.getUTCMinutes() as SixtyRange) &&
            hour.includes(date.getUTCHours() as HourRange) &&
            dayOfMonth.includes(date.getUTCDate() as DayOfTheMonthRange) &&
            month.includes(date.getUTCMonth() as MonthRange) &&
            dayOfWeek.includes(date.getUTCDay() as DayOfTheWeekRange)
        ) {
            return true
        } else {
            return false;
        }
    }
}
