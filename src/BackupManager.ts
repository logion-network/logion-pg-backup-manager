import path from "path";
import { EncryptedFileWriter } from './EncryptedFile';

import { FileManager } from "./FileManager";
import { LogsProcessor } from "./LogsProcessor";

export interface BackupManagerConfiguration {
    workingDirectory: string;
    logDirectory: string;
    fileManager: FileManager;
    password: string;
}

export class BackupManager {

    constructor(configuration: BackupManagerConfiguration) {
        this.configuration = configuration;
    }

    private configuration: BackupManagerConfiguration;

    async trigger(sequenceString: string) {
        const deltaFile = path.join(this.configuration.workingDirectory, `${sequenceString}-delta.sql.enc`);
        const writer = new EncryptedFileWriter(this.configuration.password);
        await writer.open(deltaFile);
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

        await this.configuration.fileManager.moveToIpfs(deltaFile);
    }
}
