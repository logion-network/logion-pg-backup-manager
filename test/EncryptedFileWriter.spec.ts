import os from 'os';
import path from 'path';
import { EncryptedFileReader, EncryptedFileWriter } from "../src/EncryptedFile";

const tempFileName = path.join(os.tmpdir(), "logion-pg-backup-manager-encrypted-file.dat");
const clearText = "Some clear text";
const password = "secret";

describe("EncryptedFile", () => {

    it("encrypts and decrypts properly", async () => {
        const writer = new EncryptedFileWriter(password);
        await writer.open(tempFileName);
        await writer.write(Buffer.from(clearText, 'utf-8'));
        await writer.close();

        const reader = new EncryptedFileReader(password);
        await reader.open(tempFileName);
        const data = await reader.readAll();
        await reader.close();

        expect(data.toString("utf-8")).toBe(clearText);
    });
});
