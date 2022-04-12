import { constants } from "fs";
import { access, rm } from "fs/promises";
import { DateTime, Duration } from "luxon";
import path from "path";

import { EncryptedFileWriter } from './EncryptedFile';
import { FileManager } from "./FileManager";
import { LogsProcessor } from "./LogsProcessor";
import { ProcessHandler, Shell } from "./Shell";
import { BackupFile, BackupFileName, Journal } from "./Journal";
import { Mailer } from "./Mailer";
import { getLogger } from "./util/Log";

const logger = getLogger();

export interface FullDumpConfiguration {
    readonly host: string;
    readonly user: string;
    readonly database: string;
}

export interface BackupManagerConfiguration {
    readonly workingDirectory: string;
    readonly logDirectory: string;
    readonly fileManager: FileManager;
    readonly password: string;
    readonly maxDurationSinceLastFullBackup: Duration;
    readonly shell: Shell;
    readonly fullDumpConfiguration: FullDumpConfiguration;
    readonly journalFile: string;
    readonly maxFullBackups: number;
    readonly mailer: Mailer;
    readonly mailTo: string;
    readonly triggerCron: string;
}

export class BackupManager {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    readonly configuration: BackupManagerConfiguration;

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
        const lastFullBackup = journal.getLastFullBackup();
        let deltaBackupResult: DeltaBackupResult | undefined = undefined;
        if(lastFullBackup === undefined
                || date.diff(lastFullBackup.fileName.date) > this.configuration.maxDurationSinceLastFullBackup) {
            logger.info("Producing full backup...");
            backupFile = BackupFileName.getFullBackupFileName(date);
            backupFilePath = path.join(this.configuration.workingDirectory, backupFile.fileName);
            await this.doFullBackup(backupFilePath);
        } else {
            logger.info("Producing delta...");
            backupFile = BackupFileName.getDeltaBackupFileName(date);
            backupFilePath = path.join(this.configuration.workingDirectory, backupFile.fileName);
            deltaBackupResult = await this.doDeltaBackup(backupFilePath);
        }

        if(deltaBackupResult === undefined || !deltaBackupResult.emptyDelta) {
            logger.info(`Adding file ${backupFilePath} to IPFS...`);
            const cid = await this.configuration.fileManager.moveToIpfs(backupFilePath);
            logger.info(`Success, file ${backupFilePath} got CID ${cid}`);

            journal.addBackup(new BackupFile({cid, fileName: backupFile}));

            const toRemove = journal.keepOnlyLastFullBackups(this.configuration.maxFullBackups);
            for(const file of toRemove) {
                this.configuration.fileManager.removeFileFromIpfs(file.cid);
            }

            logger.info("Writing journal...");
            await journal.write(this.configuration.journalFile);
            logger.info("Journal successfully written, sending by e-mail...");

            await this.configuration.mailer.sendMail({
                to: this.configuration.mailTo,
                subject: "Backup journal updated",
                text: "New journal file available, see attachment.",
                attachments: [
                    {
                        path: this.configuration.journalFile,
                        filename: "journal.txt"
                    }
                ]
            });
        } else {
            logger.info("No change detected.");
        }

        if(deltaBackupResult !== undefined) {
            logger.info("Removing processed logs...");
            for(const file of deltaBackupResult.logsToRemove) {
                this.configuration.fileManager.deleteFile(file);
            }
        }

        logger.info("All done.");
    }

    private async doFullBackup(backupFilePath: string) {
        const writer = new EncryptedFileWriter(this.configuration.password);
        await writer.open(backupFilePath);
        try {
            const pgDumpHandler = new PgDumpProcessHandler(writer);
            const fullDumpConfiguration = this.configuration.fullDumpConfiguration;
            const parameters = [
                '-F', 'c',
                '-h', fullDumpConfiguration.host,
                '-U', fullDumpConfiguration.user,
                fullDumpConfiguration.database
            ];
            await this.configuration.shell.spawn("pg_dump", parameters, pgDumpHandler);
            await writer.close();
        } catch(e) {
            await writer.close();
            await this.configuration.fileManager.deleteFile(backupFilePath);
            throw e;
        }
    }

    private async doDeltaBackup(backupFilePath: string): Promise<DeltaBackupResult> {
        const writer = new EncryptedFileWriter(this.configuration.password);
        await writer.open(backupFilePath);
        try {
            const logsToRemove: string[] = [];
            let emptyDelta = true;
            const logsProcessor = new LogsProcessor({
                sqlSink: async (sql) => {
                    const filteredSql = this.filterSql(sql);
                    if(filteredSql) {
                        emptyDelta = false;
                        await writer.write(Buffer.from(filteredSql, 'utf-8'));
                    } else {
                        return Promise.resolve();
                    }
                },
                filePostProcessor: (file: string) => {
                    logsToRemove.push(file);
                    return Promise.resolve();
                }
            });
            await logsProcessor.process(this.configuration.logDirectory);
            await writer.close();

            if(emptyDelta) {
                await this.configuration.fileManager.deleteFile(backupFilePath);
            }

            return { logsToRemove, emptyDelta };
        } catch(e) {
            await writer.close();
            await this.configuration.fileManager.deleteFile(backupFilePath);
            throw e;
        }
    }

    private filterSql(sql: string | undefined): string | undefined {
        if(sql
            && this.isNotSyncPointUpdate(sql)) {
            return sql;
        } else {
            return undefined;
        }
    }

    private isNotSyncPointUpdate(sql: string): boolean {
        return !sql.startsWith('UPDATE "sync_point" SET "latest_head_block_number" =');
    }
}

class PgDumpProcessHandler extends ProcessHandler {

    constructor(writer: EncryptedFileWriter) {
        super();
        this.writer = writer;
    }

    private writer: EncryptedFileWriter;

    async onStdOut(data: any) {
        await this.writer.write(data);
    }
}

interface DeltaBackupResult {
    logsToRemove: string[];
    emptyDelta: boolean;
}
