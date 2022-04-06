import { FileHandle, open } from "fs/promises";
import {
    scrypt,
    randomFill,
    createCipheriv,
    Cipher,
    Decipher,
    createDecipheriv
} from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

export class EncryptedFileWriter {

    constructor(password: string) {
        this.password = password;
    }

    private password: string;

    async open(fileName: string): Promise<void> {
        this.file = await open(fileName, 'w');

        return new Promise<void>((resolve, reject) => {
            randomFill(new Uint8Array(SALT_LENGTH), (err, salt) => {
                if (err) {
                    reject(err);
                }
                scrypt(this.password, salt, KEY_LENGTH, (err, key) => {
                    if (err) {
                        reject(err);
                    }
                    randomFill(new Uint8Array(IV_LENGTH), async (err, iv) => {
                        if (err) {
                            reject(err);
                        }

                        this.cipher = createCipheriv(ALGORITHM, key, iv);
                        await this.file!.appendFile(salt);
                        await this.file!.appendFile(iv);
                        resolve();
                    });
                });
            });
        });
    }

    private file?: FileHandle;

    private cipher?: Cipher;

    async write(data: Buffer) {
        const encrypted = this.cipher!.update(data);
        await this.file!.appendFile(encrypted);
    }

    async close() {
        const encrypted = this.cipher!.final();
        await this.file!.appendFile(encrypted);
        await this.file!.close();
    }
}

export class EncryptedFileReader {

    constructor(password: string, bufferSize: number = 1024) {
        this.password = password;
        this.buffer = new Uint8Array(bufferSize);
    }

    private password: string;

    async open(fileName: string): Promise<void> {
        this.file = await open(fileName, 'r');

        const salt = new Uint8Array(SALT_LENGTH);
        await this.file.read(salt, 0, SALT_LENGTH);

        const iv = new Uint8Array(IV_LENGTH);
        await this.file.read(iv, 0, IV_LENGTH);

        return new Promise<void>((resolve, reject) => {
            scrypt(this.password, salt, KEY_LENGTH, (err, key) => {
                if (err) {
                    reject(err);
                }

                this.decipher = createDecipheriv(ALGORITHM, key, iv);
                resolve();
            });
        });
    }

    private file?: FileHandle;

    private decipher?: Decipher;

    private buffer: Uint8Array;

    async read(): Promise<Buffer> {
        const encrypted = await this.file!.read(this.buffer, 0, this.buffer.length);

        if(encrypted!.bytesRead === 0) {
            return Buffer.from([]);
        } else if(encrypted!.bytesRead < this.buffer.length) {
            return Buffer.concat([this.decipher!.update(encrypted!.buffer.slice(0, encrypted!.bytesRead)), this.decipher!.final()]);
        } else {
            return this.decipher!.update(encrypted!.buffer);
        }
    }

    async readAll(): Promise<Buffer> {
        let chunks: Buffer[] = [];
        let chunk = await this.read();
        while(chunk.length > 0) {
            chunks.push(chunk);
            chunk = await this.read();
        }
        return Buffer.concat(chunks);
    }

    async close() {
        await this.file!.close();
    }
}
