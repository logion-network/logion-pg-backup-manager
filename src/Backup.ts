import { stat } from "fs/promises";
import { DateTime } from "luxon";
import path from "path";

import { BackupManagerCommand } from "./Command";
import { EncryptedFileWriter } from "./EncryptedFile";
import { BackupFile, BackupFileName } from "./Journal";
import { LogsProcessor } from "./LogsProcessor";
import { getLogger } from "./util/Log";

const logger = getLogger();

export class Backup extends BackupManagerCommand {

    static NAME = "Backup";

    get name(): string {
        return Backup.NAME;
    }

    async trigger(date: DateTime): Promise<void> {
        const journal = this.configuration.journal;

        let backupFile: BackupFileName;
        let backupFilePath: string;

        logger.info("Producing delta...");
        backupFile = BackupFileName.getDeltaBackupFileName(date);
        backupFilePath = path.join(this.configuration.workingDirectory, backupFile.fileName);
        const deltaBackupResult = await this.doDeltaBackup(backupFilePath);

        if(!deltaBackupResult.emptyDelta) {
            const fileStat = await stat(backupFilePath);
            logger.info(`File is ${fileStat.size} bytes large.`);
            logger.info(`Adding file ${backupFilePath} to IPFS...`);
            const cid = await this.configuration.fileManager.moveToIpfs(backupFilePath);
            logger.info(`Success, file ${backupFilePath} got CID ${cid}`);

            journal.addBackup(new BackupFile({cid, fileName: backupFile}));

            logger.info("Writing journal...");
            await journal.write();
        } else {
            logger.info("No change detected.");
        }

        logger.info("Removing processed logs...");
        for(const file of deltaBackupResult.logsToRemove) {
            this.configuration.fileManager.deleteFile(file);
        }

        if(!deltaBackupResult.emptyDelta) {
            logger.info("Sending journal by e-mail...");
            await this.configuration.mailer.sendJournalMail(this.configuration.mailTo, journal);
        }

        logger.info("All done.");
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
                        logger.debug(`Appending ${sql}`);
                        await writer.write(Buffer.from(filteredSql + ";\n", 'utf-8'));
                    } else {
                        logger.debug(`Ignoring ${sql}`);
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
            && this.isNotSyncPointMod(sql)
            && this.isNotSessionMod(sql)
            && this.isNotTransactionMod(sql)) {
            return sql;
        } else {
            return undefined;
        }
    }

    private isNotSyncPointMod(sql: string): boolean {
        return !sql.startsWith('INSERT INTO "sync_point"')
            && !sql.startsWith('UPDATE "sync_point"');
    }

    private isNotSessionMod(sql: string): boolean {
        return !sql.startsWith('INSERT INTO "session"')
            && !sql.startsWith('DELETE FROM "session"');
    }

    private isNotTransactionMod(sql: string): boolean {
        return !sql.startsWith('INSERT INTO "transaction"')
            && !sql.startsWith('DELETE FROM "transaction"');
    }
}

interface DeltaBackupResult {
    logsToRemove: string[];
    emptyDelta: boolean;
}
