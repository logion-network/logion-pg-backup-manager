import cronParser, { SixtyRange, HourRange, DayOfTheMonthRange, MonthRange, DayOfTheWeekRange } from 'cron-parser';
import { constants } from "fs";
import { access } from "fs/promises";
import { DateTime, Duration } from "luxon";
import path from "path";

import { EncryptedFileWriter } from './EncryptedFile';
import { FileManager } from "./FileManager";
import { LogsProcessor } from "./LogsProcessor";
import { Shell } from "./Shell";
import { BackupFile, BackupFileName, Journal } from "./Journal";

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
    maxDurationSinceLastFullBackup: Duration;
    shell: Shell;
    fullDumpConfiguration: FullDumpConfiguration;
    journalFile: string;
}

export class BackupManager {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    private configuration: BackupManagerConfiguration;

    async trigger(date: DateTime) {
        let journal: Journal;
        try {
            await access(this.configuration.journalFile, constants.F_OK);
            journal = await Journal.read(this.configuration.journalFile);
        } catch {
            journal = new Journal();
        }

        let backupFile: BackupFileName;
        let backupFilePath: string;
        if(journal.isEmpty()
                || date.diff(journal.getLastFullBackup()!.fileName.date) > this.configuration.maxDurationSinceLastFullBackup) {
            backupFile = BackupFileName.getFullBackupFileName(date);
            backupFilePath = path.join(this.configuration.workingDirectory, backupFile.fileName);
            await this.doFullBackup(backupFilePath);
        } else {
            backupFile = BackupFileName.getDeltaBackupFileName(date);
            backupFilePath = path.join(this.configuration.workingDirectory, backupFile.fileName);
            await this.doDeltaBackup(backupFilePath);
        }

        const cid = await this.configuration.fileManager.moveToIpfs(backupFile.fileName);

        journal.addBackup(new BackupFile({cid, fileName: backupFile}));
        await journal.write(this.configuration.journalFile);
    }

    private async doFullBackup(backupFilePath: string) {
        const fullDumpConfiguration = this.configuration.fullDumpConfiguration;
        const dumpCommand = `set -eo pipefail && pg_dump -F c -h ${fullDumpConfiguration.host} -U ${fullDumpConfiguration.user} ${fullDumpConfiguration.database} | openssl enc -aes-256-cbc -md sha512 -pbkdf2 -iter 100000 -pass pass:${this.configuration.password} > ${backupFilePath}`;
        await this.configuration.shell.exec(dumpCommand);
    }

    private async doDeltaBackup(backupFilePath: string) {
        const writer = new EncryptedFileWriter(this.configuration.password);
            await writer.open(backupFilePath);
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

    private matches(expression: string, date: DateTime): boolean {
        const {
            minute,
            hour,
            dayOfMonth,
            month,
            dayOfWeek
        } = cronParser.parseExpression(expression).fields;

        if (
            minute.includes(date.minute as SixtyRange) &&
            hour.includes(date.hour as HourRange) &&
            dayOfMonth.includes(date.day as DayOfTheMonthRange) &&
            month.includes(date.month as MonthRange) &&
            dayOfWeek.includes(date.weekday as DayOfTheWeekRange)
        ) {
            return true
        } else {
            return false;
        }
    }
}
