import { openSync, closeSync } from "fs";
import { mkdir, open, rm } from "fs/promises";
import { DateTime, Duration } from "luxon";
import { It, Mock, Times } from 'moq.ts';
import os from "os";
import path from "path";

import { BackupManager, BackupManagerConfiguration, FullDumpConfiguration } from "../src/BackupManager";
import { FileManager } from "../src/FileManager";
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
let fileManager = new Mock<FileManager>();
let backupManagerConfiguration: BackupManagerConfiguration;
const cid = "cid0";

describe("BackupManager", () => {

    beforeAll(async () => {
        await rm(workingDirectory, {force: true, recursive: true});
        await mkdir(workingDirectory, {recursive: true});
    });

    beforeEach(() => {
        fileManager = new Mock<FileManager>();
        backupManagerConfiguration = {
            fileManager: fileManager.object(),
            logDirectory: "sample_logs",
            password: "secret",
            workingDirectory,
            maxDurationSinceLastFullBackup: Duration.fromISOTime("24:00"),
            fullDumpConfiguration,
            shell: shell.object(),
            journalFile,
            maxFullBackups: 1
        };
    });

    it("creates delta", async () => {
        let now = DateTime.now();
        await addFullBackupToJournal(now.minus({hours: 1}));
        const manager = new BackupManager(backupManagerConfiguration);
        fileManager.setup(instance => instance.moveToIpfs(BackupFileName.getDeltaBackupFileName(now).fileName)).returns(Promise.resolve(cid));
        fileManager.setup(instance => instance.deleteFile(It.IsAny())).returns(Promise.resolve());

        await manager.trigger(now);

        fileManager.verify(instance => instance.moveToIpfs(BackupFileName.getDeltaBackupFileName(now).fileName), Times.Once());
        fileManager.verify(instance => instance.deleteFile(It.Is<string>(file => file.endsWith('.csv'))), Times.Exactly(8));
        fileManager.verify(instance => instance.deleteFile(It.Is<string>(file => file.endsWith('.log'))), Times.Exactly(8));
    });

    it("creates full with empty journal", async () => {
        await clearJournal();
        let now = DateTime.now();
        await testCreatesFullBackup(now);
    });

    it("creates full with too old full backup", async () => {
        let now = DateTime.now();
        const fileName = await addFullBackupToJournal(now.minus({hours: 25}));
        await testCreatesFullBackup(now, fileName);
    });

    it("creates full with only legacy backup", async () => {
        let now = DateTime.now();
        const fileName = await addFullLegacyBackupToJournal(now);
        await testCreatesFullBackup(now, fileName);
    });
});

async function addFullBackupToJournal(date: DateTime): Promise<string> {
    const file = await open(journalFile, 'w');
    const cid = "cid0";
    const fileName = BackupFileName.getFullBackupFileName(date).fileName;
    await file.write(Buffer.from(`${cid} ${fileName}\n`));
    await file.close();
    return path.join(workingDirectory, fileName);
}

async function clearJournal() {
    const file = await open(journalFile, 'w');
    await file.close();
}

async function testCreatesFullBackup(now: DateTime, removedBackupFileName?: string) {
    shell.setup(instance => instance.exec).returns(fullBackupExecMock);
    fileManager.setup(instance => instance.moveToIpfs(BackupFileName.getFullBackupFileName(now).fileName)).returns(Promise.resolve(cid));
    if(removedBackupFileName) {
        fileManager.setup(instance => instance.removeFileFromIpfs(removedBackupFileName)).returns(Promise.resolve());
    }

    const manager = new BackupManager(backupManagerConfiguration);
    await manager.trigger(now);

    fileManager.verify(instance => instance.moveToIpfs(BackupFileName.getFullBackupFileName(now).fileName), Times.Once());
    if(removedBackupFileName) {
        fileManager.verify(instance => instance.removeFileFromIpfs(removedBackupFileName), Times.Once());
    }
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

async function addFullLegacyBackupToJournal(date: DateTime): Promise<string> {
    const file = await open(journalFile, 'w');
    const cid = "cid0";
    const fileName = BackupFileName.getLegacyFullBackupFileName(date).fileName;
    await file.write(Buffer.from(`added ${cid} ${fileName}\n`));
    await file.close();
    return path.join(workingDirectory, fileName);
}
