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
        await manager.trigger("1");
        expect(existsSync(path.join(workingDirectory, "1-delta.sql.enc"))).toBe(true);
    });
});
