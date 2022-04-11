import { rm } from "fs/promises";
import { Shell } from "./Shell";

export abstract class FileManager {

    abstract deleteFile(file: string): Promise<void>;

    abstract moveToIpfs(file: string): Promise<string>;

    abstract removeFileFromIpfs(cid: string): Promise<void>;
}

export class NullFileManager extends FileManager {

    async deleteFile(): Promise<void> {
        // Skip
        return Promise.resolve();
    }

    async moveToIpfs(): Promise<string> {
        const cid = `${this.cidSequenceNumber}`;
        ++this.cidSequenceNumber;
        return Promise.resolve(cid);
    }

    private cidSequenceNumber = 0;

    async removeFileFromIpfs(): Promise<void> {
        // Skip
        return Promise.resolve();
    }
}

export interface DefaultFileManagerConfiguration {
    shell: Shell;
    ipfsClusterCtl: string;
    minReplica: number;
    maxReplica: number;
}

export class DefaultFileManager extends FileManager {

    constructor(configuration: DefaultFileManagerConfiguration) {
        super();
        this.configuration = configuration;
    }

    private configuration: DefaultFileManagerConfiguration;

    async deleteFile(file: string): Promise<void> {
        await rm(file);
    }

    async moveToIpfs(file: string): Promise<string> {
        const addCommand = `${this.configuration.ipfsClusterCtl} add ${file} --rmin ${this.configuration.minReplica} --rmax ${this.configuration.minReplica} --local`;
        const { stdout } = await this.configuration.shell.exec(addCommand);
        await this.deleteFile(file);
        return stdout;
    }

    async removeFileFromIpfs(cid: string): Promise<void> {
        const removeCommand = `${this.configuration.ipfsClusterCtl} pin rm ${cid}`;
        await this.configuration.shell.exec(removeCommand);
    }
}
