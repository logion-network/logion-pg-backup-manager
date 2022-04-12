import { mkdir, open, rm } from "fs/promises";
import { DateTime, Duration } from "luxon";
import { It, Mock, Times } from 'moq.ts';
import os from "os";
import path from "path";

import { BackupManager, BackupManagerConfiguration, FullDumpConfiguration } from "../src/BackupManager";
import { FileManager } from "../src/FileManager";
import { BackupFileName } from "../src/Journal";
import { Mailer, MailMessage } from "../src/Mailer";
import { ProcessHandler, Shell } from "../src/Shell";

const workingDirectory = path.join(os.tmpdir(), "backup-manager-test");
const fullDumpConfiguration: FullDumpConfiguration = {
    user: "postgres",
    database: "postgres",
    host: "localhost"
};
const shell = new Mock<Shell>();
const journalFile = path.join(workingDirectory, "journal");
let fileManager: Mock<FileManager>;
let backupManagerConfiguration: BackupManagerConfiguration;
const cid = "cid0";
let mailer: Mock<Mailer>;
const mailTo = "john.doe@logion.network";

describe("BackupManager", () => {

    beforeAll(async () => {
        await rm(workingDirectory, {force: true, recursive: true});
        await mkdir(workingDirectory, {recursive: true});
    });

    beforeEach(() => {
        fileManager = new Mock<FileManager>();

        mailer = new Mock<Mailer>();
        mailer.setup(instance => instance.sendMail(It.IsAny())).returns(Promise.resolve());

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
            triggerCron: "* * * * * *"
        };
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

        verifyMailSent();
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

async function testCreatesFullBackup(now: DateTime, removedBackupFileName?: string) {
    shell.setup(instance => instance.spawn).returns(fullBackupSpawnMock);
    fileManager.setup(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName))).returns(Promise.resolve(cid));
    if(removedBackupFileName) {
        fileManager.setup(instance => instance.removeFileFromIpfs(removedBackupFileName)).returns(Promise.resolve());
    }

    const manager = new BackupManager(backupManagerConfiguration);
    await manager.trigger(now);

    fileManager.verify(instance => instance.moveToIpfs(path.join(workingDirectory, BackupFileName.getFullBackupFileName(now).fileName)), Times.Once());
    if(removedBackupFileName) {
        fileManager.verify(instance => instance.removeFileFromIpfs(removedBackupFileName), Times.Once());
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

async function addFullLegacyBackupToJournal(date: DateTime): Promise<string> {
    const file = await open(journalFile, 'w');
    const cid = "cid0";
    const fileName = BackupFileName.getLegacyFullBackupFileName(date).fileName;
    await file.write(Buffer.from(`added ${cid} ${fileName}\n`));
    await file.close();
    return path.join(workingDirectory, fileName);
}
