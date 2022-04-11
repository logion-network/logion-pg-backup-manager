export abstract class FileManager {

    abstract deleteFile(file: string): Promise<void>;

    abstract moveToIpfs(file: string): Promise<string>;

    abstract removeFileFromIpfs(file: string): Promise<void>;
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
