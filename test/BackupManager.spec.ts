import { mkdir, open, rm } from "fs/promises";
import { DateTime } from "luxon";
import { It, Mock, Times } from 'moq.ts';
import os from "os";
import path from "path";

import { BackupManager } from "../src/BackupManager";
import { BackupManagerConfiguration, FullDumpConfiguration } from "../src/Command";
import { CommandFile } from "../src/CommandFile";
import { EncryptedFileWriter } from "../src/EncryptedFile";
import { ErrorFile, ErrorState } from "../src/ErrorFile";
import { FileManager } from "../src/FileManager";
import { BackupFile, BackupFileName, Journal } from "../src/Journal";
import { Mailer } from "../src/Mailer";
import { ProcessHandler, Shell } from "../src/Shell";

const workingDirectory = path.join(os.tmpdir(), "backup-manager-test");
const fullDumpConfiguration: FullDumpConfiguration = {
    user: "postgres",
    database: "postgres",
    host: "localhost"
};
let shell: Mock<Shell>;
const journalFile = path.join(workingDirectory, "journal");
let fileManager: Mock<FileManager>;
let backupManagerConfiguration: BackupManagerConfiguration;
const cid = "cid0";
let mailer: Mock<Mailer>;
const mailTo = "john.doe@logion.network";
const commandFile = path.join(workingDirectory, "command");
const errorFile = path.join(workingDirectory, "error");

describe("BackupManager", () => {

    beforeAll(async () => {
        await rm(workingDirectory, {force: true, recursive: true});
        await mkdir(workingDirectory, {recursive: true});
    });

    beforeEach(async () => {
        fileManager = new Mock<FileManager>();

        mailer = new Mock<Mailer>();
        mailer.setup(instance => instance.sendJournalMail(It.IsAny(), It.IsAny())).returns(Promise.resolve());
        mailer.setup(instance => instance.sendFailureMail(It.IsAny())).returns(Promise.resolve());

        shell = new Mock<Shell>();

        await setCommand("Default");
    });

    it("creates delta", async () => {
        let now = DateTime.now();
        await addFullBackupToJournal(now.minus({hours: 1}));
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        fileManager.setup(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getDeltaBackupFileName(now).fileName))).returns(Promise.resolve(cid));
        fileManager.setup(instance => instance.deleteFile(It.IsAny())).returns(Promise.resolve());

        await manager.trigger(now);

        fileManager.verify(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getDeltaBackupFileName(now).fileName)), Times.Once());
        fileManager.verify(instance => instance.deleteFile(It.Is<string>(file => file.endsWith('.csv'))), Times.Exactly(8));
        fileManager.verify(instance => instance.deleteFile(It.Is<string>(file => file.endsWith('.log'))), Times.Exactly(8));
        fileManager.verify(instance => instance.removeFileFromIpfs(It.IsAny()), Times.Never());

        verifyMailSent();
    });

    it("creates full with empty journal", async () => {
        await clearJournal();
        let now = DateTime.now();
        await testCreatesFullBackup(now);
    });

    it("creates full with only legacy backup", async () => {
        let now = DateTime.now();
        const file = await addFullLegacyBackupToJournal(now);
        await testCreatesFullBackup(now, file.cid);
    });

    it("creates full with command", async () => {
        let now = DateTime.now();
        await addFullBackupToJournal(now.minus({hours: 2}));
        const delta = await addDeltaBackupToJournal(now.minus({hours: 1}));
        await setCommand("FullBackup");
        await testCreatesFullBackup(now, delta.cid);
    });

    it("restores", async () => testRestore(false));
    it("forces restore only with restoreAndClose flag set", async () => testRestore(true));

    it("sends failure notification if no error file", async () => {
        await rm(errorFile, {force: true});
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        await manager.notifyFailure("Backup", DateTime.now(), new Error());
        verifyFailureNotificationSent(true);
        await verifyErrorStateIs("BackupFailure");
    });

    it("sends failure notification if error flag unset", async () => {
        await setErrorState("None");
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        await manager.notifyFailure("Backup", DateTime.now(), new Error());
        verifyFailureNotificationSent(true);
        await verifyErrorStateIs("BackupFailure");
    });

    it("does not send failure notification if error flag set", async () => {
        await setErrorState("BackupFailure");
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        await manager.notifyFailure("Backup", DateTime.now(), new Error());
        verifyFailureNotificationSent(false);
        await verifyErrorStateIs("BackupFailure");
    });

    it("unsets error flag after successful command execution", async () => {
        const now = DateTime.now();
        await setErrorState("BackupFailure");
        await addFullBackupToJournal(now.minus({hours: 1}));
        fileManager.setup(instance => instance.moveToIpfs(It.IsAny())).returns(Promise.resolve("cid"));
        fileManager.setup(instance => instance.deleteFile(It.IsAny())).returns(Promise.resolve());
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        await manager.trigger(now);
        verifyFailureNotificationSent(false);
        await verifyErrorStateIs("None");
    });

    it("sends failed journal e-mail on command execution", async () => {
        const now = DateTime.now();
        await setErrorState("EmailJournalFailure");
        await setCommand("Backup");
        fileManager.setup(instance => instance.deleteFile(It.IsAny())).returns(Promise.resolve());
        fileManager.setup(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName))).returns(Promise.resolve(""));
        shell.setup(instance => instance.spawn).returns(fullBackupSpawnMock);
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        await manager.trigger(now);
        verifyMailSent(2);
        await verifyErrorStateIs("None");
    });

    it("sends failed error e-mail on command execution", async () => {
        const now = DateTime.now();
        await setErrorState("EmailErrorFailure");
        await setCommand("Backup");
        fileManager.setup(instance => instance.deleteFile(It.IsAny())).returns(Promise.resolve());
        fileManager.setup(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName))).returns(Promise.resolve(""));
        shell.setup(instance => instance.spawn).returns(fullBackupSpawnMock);
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        await manager.trigger(now);
        verifyFailureNotificationSent(true);
        verifyMailSent(1);
        await verifyErrorStateIs("None");
    });

    it("does not send failure notification if failed sending error e-mail", async () => {
        await setErrorState("EmailErrorFailure");
        await setConfig();
        const manager = new BackupManager(backupManagerConfiguration);
        await manager.notifyFailure("Backup", DateTime.now(), new Error());
        verifyFailureNotificationSent(false);
        await verifyErrorStateIs("EmailErrorFailure");
    });
});

async function setConfig(restoredAndClose?: boolean) {
    backupManagerConfiguration = {
        fileManager: fileManager.object(),
        logDirectory: "sample_logs",
        password: "secret",
        workingDirectory,
        fullDumpConfiguration,
        shell: shell.object(),
        journal: await Journal.read(journalFile),
        maxFullBackups: 1,
        mailer: mailer.object(),
        mailTo,
        triggerCron: "* * * * * *",
        fullBackupTriggerCron: "* * * * * *",
        commandFile: new CommandFile(commandFile),
        errorFile: new ErrorFile(errorFile),
        restoredAndClose: restoredAndClose || false,
    };
}

async function addFullBackupToJournal(date: DateTime): Promise<BackupFile> {
    const file = await open(journalFile, 'w');
    const cid = "cid0";
    const fileName = BackupFileName.getFullBackupFileName(date);
    await file.write(Buffer.from(`${cid} ${fileName.fileName}\n`));
    await file.close();
    return new BackupFile({
        cid,
        fileName
    });
}

function verifyMailSent(times?: number) {
    mailer.verify(instance => instance.sendJournalMail(mailTo, backupManagerConfiguration.journal), Times.Exactly(times === undefined ? 1 : times));
}

async function clearJournal() {
    const file = await open(journalFile, 'w');
    await file.close();
}

async function testCreatesFullBackup(now: DateTime, removedBackupCid?: string) {
    await setConfig();
    shell.setup(instance => instance.spawn).returns(fullBackupSpawnMock);
    fileManager.setup(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName))).returns(Promise.resolve(""));
    if(removedBackupCid) {
        fileManager.setup(instance => instance.removeFileFromIpfs(removedBackupCid)).returns(Promise.resolve());
    }

    const manager = new BackupManager(backupManagerConfiguration);
    await manager.trigger(now);

    fileManager.verify(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName)), Times.Once());
    if(removedBackupCid) {
        fileManager.verify(instance => instance.removeFileFromIpfs(removedBackupCid), Times.Once());
    }

    verifyMailSent();
}

function fullBackupSpawnMock(command: string, parameters: string[], _handler: ProcessHandler): Promise<void> {
    const expectedParameters = [
        '-F', 'c',
        '-h', fullDumpConfiguration.host,
        '-U', fullDumpConfiguration.user,
        fullDumpConfiguration.database
    ];
    if(command === 'pg_dump'
        && parameters.every((value, index) => value === expectedParameters[index])) {
        return Promise.resolve();
    } else {
        return Promise.reject(new Error());
    }
}

async function addFullLegacyBackupToJournal(date: DateTime): Promise<BackupFile> {
    const file = await open(journalFile, 'w');
    const cid = "cid0";
    const fileName = BackupFileName.getLegacyFullBackupFileName(date);
    await file.write(Buffer.from(`added ${cid} ${fileName.fileName}\n`));
    await file.close();
    return new BackupFile({
        cid,
        fileName
    });
}

async function addDeltaBackupToJournal(date: DateTime): Promise<BackupFile> {
    const file = await open(journalFile, 'a');
    const cid = "cid1";
    const fileName = BackupFileName.getDeltaBackupFileName(date);
    await file.write(Buffer.from(`${cid} ${fileName.fileName}\n`));
    await file.close();
    return new BackupFile({
        cid,
        fileName
    });
}

async function setCommand(commandName: string): Promise<void> {
    const file = await open(commandFile, 'w');
    await file.write(Buffer.from(`${commandName}`));
    await file.close();
}

async function createEncryptedFile(path: string): Promise<void> {
    const file = await open(path, 'w');
    const writer = new EncryptedFileWriter(backupManagerConfiguration.password);
    await writer.open(path);
    await writer.write(Buffer.from("data", 'utf-8'));
    await writer.close();
    await file.close();
}

function pgRestoreOptions(parameters: string[]): boolean {
    const expectedParameters = [
        '-F', 'c',
        '-h', fullDumpConfiguration.host,
        '-U', fullDumpConfiguration.user,
        fullDumpConfiguration.database
    ];
    return parameters.every((value, index) => value === expectedParameters[index]);
}

function psqlOptions(parameters: string[]): boolean {
    const expectedParameters = [
        '-h', fullDumpConfiguration.host,
        '-U', fullDumpConfiguration.user,
        fullDumpConfiguration.database
    ];
    return parameters.every((value, index) => value === expectedParameters[index]);
}

async function setErrorState(errorState: ErrorState) {
    const file = await open(errorFile, 'w');
    await file.write(errorState);
    await file.close();
}

function verifyFailureNotificationSent(expectSent: boolean) {
    if(expectSent) {
        mailer.verify(instance => instance.sendFailureMail(It.IsAny()), Times.Once());
    } else {
        mailer.verify(instance => instance.sendFailureMail(It.IsAny()), Times.Never());
    }
}

async function verifyErrorStateIs(expectState: ErrorState) {
    const file = await open(errorFile, 'r');
    const content = await file.readFile('utf-8');
    await file.close();
    expect(content).toBe(expectState);
}

async function testRestore(restoreAndClose: boolean) {
    let now = DateTime.now();
    const fullFile = await addFullBackupToJournal(now.minus({hours: 1}));
    const deltaFile = await addDeltaBackupToJournal(now.minus({minutes: 30}));
    if(!restoreAndClose) {
        await setCommand("Restore");
    }
    await setConfig(restoreAndClose);

    const manager = new BackupManager(backupManagerConfiguration);
    fileManager.setup(instance => instance.downloadFromIpfs(It.IsAny(), It.IsAny())).returns(Promise.resolve());
    fileManager.setup(instance => instance.deleteFile(It.IsAny())).returns(Promise.resolve());

    const fullFilePath = path.join(workingDirectory, fullFile.fileName.fileName);
    await createEncryptedFile(fullFilePath);
    const deltaFilePath = path.join(workingDirectory, deltaFile.fileName.fileName);
    await createEncryptedFile(deltaFilePath);

    shell.setup(instance => instance.spawn(It.Is(command => command === "pg_restore"), It.Is(pgRestoreOptions), It.IsAny())).returns(Promise.resolve());
    shell.setup(instance => instance.spawn(It.Is(command => command === "psql"), It.Is(psqlOptions), It.IsAny())).returns(Promise.resolve());

    await manager.trigger(now);

    fileManager.verify(instance => instance.downloadFromIpfs(fullFile.cid, fullFilePath), Times.Once());
    fileManager.verify(instance => instance.deleteFile(fullFilePath), Times.Once());

    fileManager.verify(instance => instance.downloadFromIpfs(deltaFile.cid, deltaFilePath), Times.Once());
    fileManager.verify(instance => instance.deleteFile(deltaFilePath), Times.Once());

    shell.verify(instance => instance.spawn(It.Is(command => command === "pg_restore"), It.IsAny(), It.IsAny()), Times.Once());
    shell.verify(instance => instance.spawn(It.Is(command => command === "psql"), It.IsAny(), It.IsAny(), It.IsAny()), Times.Once());

    verifyFailureNotificationSent(false);
    verifyMailSent(0);
    await verifyCommandIs("Pause");
}

async function verifyCommandIs(expectCommand: string) {
    const file = await open(commandFile, 'r');
    const content = await file.readFile('utf-8');
    await file.close();
    expect(content).toBe(expectCommand);
}
