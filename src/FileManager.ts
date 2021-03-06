import { rm } from "fs/promises";
import { Shell } from "./Shell";

export abstract class FileManager {

    abstract deleteFile(file: string): Promise<void>;

    abstract moveToIpfs(file: string): Promise<string>;

    abstract removeFileFromIpfs(cid: string): Promise<void>;

    abstract downloadFromIpfs(cid: string, file: string): Promise<void>;
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

    async downloadFromIpfs(): Promise<void> {
        // Skip
        return Promise.resolve();
    }
}

export interface DefaultFileManagerConfiguration {
    shell: Shell;
    ipfsClusterCtl: string;
    ipfsClusterHost: string;
    minReplica: number;
    maxReplica: number;
    ipfs: string;
    ipfsHost: string;
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
        const addCommand = `${this.configuration.ipfsClusterCtl} --host ${this.configuration.ipfsClusterHost} add --rmin ${this.configuration.minReplica} --rmax ${this.configuration.maxReplica} --local '${file}'`;
        const { stdout } = await this.configuration.shell.exec(addCommand);
        await this.deleteFile(file);
        const output = stdout.split(" ");
        return output[1];
    }

    async removeFileFromIpfs(cid: string): Promise<void> {
        const removeCommand = `${this.configuration.ipfsClusterCtl} --host ${this.configuration.ipfsClusterHost} pin rm ${cid}`;
        await this.configuration.shell.exec(removeCommand);
    }

    async downloadFromIpfs(cid: string, file: string): Promise<void> {
        const downloadCommand = `${this.configuration.ipfs} --api ${this.configuration.ipfsHost} get ${cid} -o ${file}`;
        await this.configuration.shell.exec(downloadCommand);
    }
}
