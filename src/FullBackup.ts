import { stat } from "fs/promises";
import { DateTime } from "luxon";
import path from "path";

import { BackupManagerCommand } from "./Command";
import { EncryptedFileWriter } from "./EncryptedFile";
import { BackupFile, BackupFileName } from "./Journal";
import { ProcessHandler } from "./Shell";
import { getLogger } from "./util/Log";

const logger = getLogger();

export class FullBackup extends BackupManagerCommand {

    static NAME = "FullBackup";

    get name(): string {
        return FullBackup.NAME;
    }

    async trigger(date: DateTime): Promise<void> {
        const journal = this.configuration.journal;

        let backupFile: BackupFileName;
        let backupFilePath: string;
        
        logger.info("Producing full backup...");
        backupFile = BackupFileName.getFullBackupFileName(date);
        backupFilePath = path.join(this.configuration.workingDirectory, backupFile.fileName);
        await this.doFullBackup(backupFilePath);

        const fileStat = await stat(backupFilePath);
        logger.info(`File is ${fileStat.size} bytes large.`);
        logger.info(`Adding file ${backupFilePath} to IPFS...`);
        const cid = await this.configuration.fileManager.moveToIpfs(backupFilePath);
        logger.info(`Success, file ${backupFilePath} got CID ${cid}`);

        journal.addBackup(new BackupFile({cid, fileName: backupFile}));

        const toRemove = journal.keepOnlyLastFullBackups(this.configuration.maxFullBackups);
        for(const file of toRemove) {
            logger.info(`Clean-up: removing ${file.fileName.fileName} from IPFS...`);
            this.configuration.fileManager.removeFileFromIpfs(file.cid);
        }

        logger.info("Writing journal...");
        await journal.write();
        logger.info("Journal successfully written, sending by e-mail...");

        await this.configuration.mailer.sendMail({
            to: this.configuration.mailTo,
            subject: "Backup journal updated",
            text: "New journal file available, see attachment.",
            attachments: [
                {
                    path: this.configuration.journal.path,
                    filename: "journal.txt"
                }
            ]
        });

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

    async onStdErr(data: any) {
        logger.warn(data.toString("utf-8"));
    }
}
