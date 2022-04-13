import path from "path";
import { Writable } from "stream";

import { BackupManagerCommand } from "./Command";
import { EncryptedFileReader } from "./EncryptedFile";
import { BackupFile, readJournalOrNew } from "./Journal";
import { ProcessHandler } from "./Shell";
import { getLogger } from "./util/Log";

const logger = getLogger();

export class Restore extends BackupManagerCommand {

    async trigger(): Promise<void> {
        const journal = await readJournalOrNew(this.configuration.journalFile);
        const recoveryPath = journal.getRecoveryPath();
        for(const file of recoveryPath) {
            if(file.fileName.type === "FULL") {
                await this.restoreDump(file);
            } else if(file.fileName.type === "DELTA") {
                await this.loadDelta(file);
            } else {
                throw new Error(`Unsupported backup file type ${file.fileName.type}`);
            }
        }
    }

    private async restoreDump(file: BackupFile) {
        logger.info(`Restoring dump ${file.fileName.fileName}...`);

        const fullDumpConfiguration = this.configuration.fullDumpConfiguration;
        const parameters = [
            '-F', 'c',
            '-h', fullDumpConfiguration.host,
            '-U', fullDumpConfiguration.user,
            '-d', fullDumpConfiguration.database
        ];

        await this.loadAndPipe(file, handler => this.configuration.shell.spawn("pg_restore", parameters, handler));
    }

    private async loadAndPipe(file: BackupFile, spawner: (handler: RestoreProcessHandler) => Promise<void>) {
        const backupFilePath = path.join(this.configuration.workingDirectory, file.fileName.fileName);
        await this.configuration.fileManager.downloadFromIpfs(file.cid, backupFilePath);

        const reader = new EncryptedFileReader(this.configuration.password);
        await reader.open(backupFilePath);
        try {
            await spawner(new RestoreProcessHandler(reader));
            await reader.close();
        } catch(e) {
            await reader.close();
            throw e;
        } finally {
            this.configuration.fileManager.deleteFile(backupFilePath);
        }
    }

    private async loadDelta(file: BackupFile) {
        logger.info(`Loading delta ${file.fileName.fileName}...`);

        const fullDumpConfiguration = this.configuration.fullDumpConfiguration;
        const parameters = [
            '-h', fullDumpConfiguration.host,
            '-U', fullDumpConfiguration.user,
            fullDumpConfiguration.database
        ];

        await this.loadAndPipe(file, handler => this.configuration.shell.spawn("psql", parameters, handler));
    }
}

class RestoreProcessHandler extends ProcessHandler {

    constructor(reader: EncryptedFileReader) {
        super();
        this.reader = reader;
    }

    private reader: EncryptedFileReader;

    async onStdIn(stdin: Writable) {
        let chunk = await this.reader.read();
        while(chunk.length > 0) {
            await new Promise<void>((resolve, reject) => {
                stdin.write(chunk, error => {
                    if(error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            chunk = await this.reader.read();
        }
        stdin.end();
    }

    async onStdOut(data: any): Promise<void> {
        logger.debug(data.toString("utf-8"));
    }

    async onStdErr(data: any): Promise<void> {
        logger.warn(data.toString("utf-8"));
    }
}
