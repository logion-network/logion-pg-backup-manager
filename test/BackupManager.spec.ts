import { mkdir, open, rm } from "fs/promises";
import { DateTime, Duration } from "luxon";
import { It, Mock, Times } from 'moq.ts';
import os from "os";
import path from "path";

import { BackupManager, CommandName } from "../src/BackupManager";
import { BackupManagerConfiguration, FullDumpConfiguration } from "../src/Command";
import { EncryptedFileWriter } from "../src/EncryptedFile";
import { FileManager } from "../src/FileManager";
import { BackupFile, BackupFileName } from "../src/Journal";
import { Mailer, MailMessage } from "../src/Mailer";
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

describe("BackupManager", () => {

    beforeAll(async () => {
        await rm(workingDirectory, {force: true, recursive: true});
        await mkdir(workingDirectory, {recursive: true});
    });

    beforeEach(async () => {
        fileManager = new Mock<FileManager>();

        mailer = new Mock<Mailer>();
        mailer.setup(instance => instance.sendMail(It.IsAny())).returns(Promise.resolve());

        shell = new Mock<Shell>();

        backupManagerConfiguration = {
            fileManager: fileManager.object(),
            logDirectory: "sample_logs",
            password: "secret",
            workingDirectory,
            maxDurationSinceLastFullBackup: Duration.fromISOTime("24:00"),
            fullDumpConfiguration,
            shell: shell.object(),
            journalFile,
            maxFullBackups: 1,
            mailer: mailer.object(),
            mailTo,
            triggerCron: "* * * * * *",
            commandFile,
            forceFullBackup: false,
        };

        await setCommand("Default");
    });

    it("creates delta", async () => {
        let now = DateTime.now();
        await addFullBackupToJournal(now.minus({hours: 1}));
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

    it("creates full with too old full backup", async () => {
        let now = DateTime.now();
        const file = await addFullBackupToJournal(now.minus({hours: 25}));
        await testCreatesFullBackup(now, file.cid);
    });

    it("creates full with only legacy backup", async () => {
        let now = DateTime.now();
        const file = await addFullLegacyBackupToJournal(now);
        await testCreatesFullBackup(now, file.cid);
    });

    it("restores", async () => {
        let now = DateTime.now();
        const fullFile = await addFullBackupToJournal(now.minus({hours: 1}));
        const deltaFile = await addDeltaBackupToJournal(now.minus({minutes: 30}));
        await setCommand("Restore");

        const manager = new BackupManager(backupManagerConfiguration);
        fileManager.setup(instance => instance.downloadFromIpfs(It.IsAny(), It.IsAny())).returns(Promise.resolve());
        fileManager.setup(instance => instance.deleteFile(It.IsAny())).returns(Promise.resolve());
        fileManager.setup(instance => instance.moveToIpfs(It.IsAny())).returns(Promise.resolve("cid2"));

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

        const postRestoreBackupFile = path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName);
        fileManager.verify(instance => instance.moveToIpfs(postRestoreBackupFile), Times.Once());
    });
});

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

function verifyMailSent() {
    mailer.verify(instance => instance.sendMail(It.Is<MailMessage>(param =>
        param.to === mailTo
        && param.subject === "Backup journal updated"
        && param.text !== undefined
        && param.attachments !== undefined
        && param.attachments.length === 1
        && param.attachments[0].path === journalFile
        && param.attachments[0].filename === "journal.txt"
    )), Times.Exactly(1));
}

async function clearJournal() {
    const file = await open(journalFile, 'w');
    await file.close();
}

async function testCreatesFullBackup(now: DateTime, removedBackupCid?: string) {
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

function fullBackupSpawnMock(command: string, parameters: string[], handler: ProcessHandler): Promise<void> {
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

async function setCommand(commandName: CommandName): Promise<void> {
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
