import { existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import os from "os";
import path from "path";
import { BackupManager } from "../src/BackupManager";
import { NullFileManager } from "../src/FileManager";

const workingDirectory = path.join(os.tmpdir(), "backup-manager-test");

describe("BackupManager", () => {

    beforeAll(async () => {
        await rm(workingDirectory, {force: true, recursive: true});
        await mkdir(workingDirectory, {recursive: true});
    });

    it("creates delta", async () => {
        const fileManager = new NullFileManager();
        const manager = new BackupManager({
            fileManager,
            logDirectory: "sample_logs",
            password: "secret",
            workingDirectory
        });
        const now = new Date();
        await manager.trigger(now);
        expect(existsSync(path.join(workingDirectory, `${now.toISOString()}-delta.sql.enc`))).toBe(true);
    });
});
