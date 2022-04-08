import { existsSync, openSync, closeSync } from "fs";
import { mkdir, open, rm } from "fs/promises";
import { DateTime, Duration } from "luxon";
import { Mock } from 'moq.ts';
import os from "os";
import path from "path";

import { BackupManager, FullDumpConfiguration } from "../src/BackupManager";
import { NullFileManager } from "../src/FileManager";
import { BackupFileName } from "../src/Journal";
import { Shell, ShellExecResult } from "../src/Shell";

const workingDirectory = path.join(os.tmpdir(), "backup-manager-test");
const fullDumpConfiguration: FullDumpConfiguration = {
    user: "postgres",
    database: "postgres",
    host: "localhost"
};
const shell = new Mock<Shell>();
const journalFile = path.join(workingDirectory, "journal");

describe("BackupManager", () => {

    beforeAll(async () => {
        await rm(workingDirectory, {force: true, recursive: true});
        await mkdir(workingDirectory, {recursive: true});
    });

    it("creates delta", async () => {
        let now = DateTime.now();
        await addFullBackupToJournal(now.minus({hours: 1}));
        const fileManager = new NullFileManager();
        const manager = new BackupManager({
            fileManager,
            logDirectory: "sample_logs",
            password: "secret",
            workingDirectory,
            maxDurationSinceLastFullBackup: Duration.fromISOTime("24:00"),
            fullDumpConfiguration,
            shell: shell.object(),
            journalFile
        });
        await manager.trigger(now);
        expect(existsSync(path.join(workingDirectory, BackupFileName.getDeltaBackupFileName(now).fileName))).toBe(true);
    });

    it("creates full with empty journal", async () => {
        await clearJournal();
        let now = DateTime.now();
        await testCreatesFullBackup(now);
    });

    it("creates full with too old full backup", async () => {
        let now = DateTime.now();
        await addFullBackupToJournal(now.minus({hours: 25}));
        await testCreatesFullBackup(now);
    });

    it("creates full with only legacy backup", async () => {
        let now = DateTime.now();
        await addFullLegacyBackupToJournal(now);
        await testCreatesFullBackup(now);
    });
});

async function addFullBackupToJournal(date: DateTime) {
    const file = await open(journalFile, 'w');
    const cid = "cid0";
    const fileName = BackupFileName.getFullBackupFileName(date).fileName;
    await file.write(Buffer.from(`${cid} ${fileName}\n`));
    await file.close();
}

async function clearJournal() {
    const file = await open(journalFile, 'w');
    await file.close();
}

async function testCreatesFullBackup(now: DateTime) {
    const fileManager = new NullFileManager();
    shell.setup(instance => instance.exec).returns(fullBackupExecMock);
    const manager = new BackupManager({
        fileManager,
        logDirectory: "sample_logs",
        password: "secret",
        workingDirectory,
        maxDurationSinceLastFullBackup: Duration.fromISOTime("24:00"),
        fullDumpConfiguration,
        shell: shell.object(),
        journalFile
    });
    await manager.trigger(now);
    expect(existsSync(path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName))).toBe(true);
}

function fullBackupExecMock(command: string): Promise<ShellExecResult> {
    const expectedCommandPrefix = "set -eo pipefail && pg_dump -F c -h localhost -U postgres postgres | openssl enc -aes-256-cbc -md sha512 -pbkdf2 -iter 100000 -pass pass:secret > ";
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

async function addFullLegacyBackupToJournal(date: DateTime) {
    const file = await open(journalFile, 'w');
    const cid = "cid0";
    const fileName = BackupFileName.getLegacyFullBackupFileName(date).fileName;
    await file.write(Buffer.from(`added ${cid} ${fileName}\n`));
    await file.close();
}
