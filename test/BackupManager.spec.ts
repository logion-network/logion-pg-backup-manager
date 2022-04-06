import { existsSync, openSync, closeSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { Mock } from 'moq.ts';
import os from "os";
import path from "path";

import { BackupManager, FullDumpConfiguration } from "../src/BackupManager";
import { NullFileManager } from "../src/FileManager";
import { Shell, ShellExecResult } from "../src/Shell";

const workingDirectory = path.join(os.tmpdir(), "backup-manager-test");
const fullDumpConfiguration: FullDumpConfiguration = {
    user: "postgres",
    database: "postgres",
    host: "localhost"
};
const shell = new Mock<Shell>();

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
            workingDirectory,
            fullBackupSchedule: "* 0 * * *",
            fullDumpConfiguration,
            shell: shell.object()
        });
        const now = new Date();
        if(now.getUTCHours() === 0) {
            now.setUTCHours(1);
        }
        await manager.trigger(now);
        expect(existsSync(path.join(workingDirectory, `${now.toISOString()}-delta.sql.enc`))).toBe(true);
    });

    it("creates full", async () => {
        const fileManager = new NullFileManager();
        shell.setup(instance => instance.exec).returns(fullBackupExecMock);
        const manager = new BackupManager({
            fileManager,
            logDirectory: "sample_logs",
            password: "secret",
            workingDirectory,
            fullBackupSchedule: "* 0 * * *",
            fullDumpConfiguration,
            shell: shell.object()
        });
        const now = new Date();
        if(now.getUTCHours() !== 0) {
            now.setUTCHours(0);
        }
        await manager.trigger(now);
        expect(existsSync(path.join(workingDirectory, `${now.toISOString()}-full.sql.enc`))).toBe(true);
    });
});

function fullBackupExecMock(command: string): Promise<ShellExecResult> {
    const expectedCommandPrefix = "pg_dump -F c -h localhost -U postgres postgres | openssl enc -aes-256-cbc -md sha512 -pbkdf2 -iter 100000 -pass pass:secret > ";
    if(command.startsWith(expectedCommandPrefix)) {
        const fileName = command.substring(expectedCommandPrefix.length);

        closeSync(openSync(fileName, 'w')); // Creates empty file with expected name

        return Promise.resolve({
            stdout: "",
            stderr: ""
        })
    } else {
        return Promise.reject(new Error());
    }
}
