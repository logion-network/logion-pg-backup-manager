import { open } from 'fs/promises';
import { DateTime, Zone } from 'luxon';

const FULL_BACKUP_FILE_NAME_SUFFIX = "-full.sql.enc";

const DELTA_BACKUP_FILE_NAME_SUFFIX = "-delta.sql.enc";

const FULL_LEGACY_BACKUP_FILE_NAME_PREFIX = "dump_";

const LEGACY_DATE_LENGTH = 'YYYY-MM-DD'.length;

export type BackupFileNameType = 'FULL' | 'DELTA' | 'FULL_LEGACY';

export class BackupFileName {

    static getFullBackupFileName(date: DateTime): BackupFileName {
        return new BackupFileName({
            date: date,
            type: 'FULL'
        });
    }

    static getDeltaBackupFileName(date: DateTime): BackupFileName {
        return new BackupFileName({
            date: date,
            type: 'DELTA'
        });
    }

    static getLegacyFullBackupFileName(date: DateTime): BackupFileName {
        return new BackupFileName({
            date: date,
            type: 'FULL_LEGACY'
        });
    }

    static parse(fileName: string): BackupFileName {
        if(fileName.endsWith(FULL_BACKUP_FILE_NAME_SUFFIX)) {
            const dateString = fileName.substring(0, fileName.length - FULL_BACKUP_FILE_NAME_SUFFIX.length);
            return new BackupFileName({
                date: DateTime.fromISO(dateString),
                type: 'FULL'
            });
        } else if(fileName.endsWith(DELTA_BACKUP_FILE_NAME_SUFFIX)) {
            const dateString = fileName.substring(0, fileName.length - DELTA_BACKUP_FILE_NAME_SUFFIX.length);
            return new BackupFileName({
                date: DateTime.fromISO(dateString),
                type: 'DELTA'
            });
        } else if(fileName.startsWith(FULL_LEGACY_BACKUP_FILE_NAME_PREFIX)) {
            const dateString = fileName.substring(FULL_LEGACY_BACKUP_FILE_NAME_PREFIX.length, FULL_LEGACY_BACKUP_FILE_NAME_PREFIX.length + LEGACY_DATE_LENGTH);
            return new BackupFileName({
                date: DateTime.fromISO(dateString, {zone: 'utc'}),
                type: 'FULL_LEGACY'
            });
        } else {
            throw new Error("Bad file name format");
        }
    }

    constructor(args: {
        date: DateTime,
        type: BackupFileNameType
    }) {
        this.date = args.date;
        this.type = args.type;
    }

    readonly date: DateTime;

    readonly type: BackupFileNameType;

    get fileName(): string {
        if(this.type === 'FULL') {
            return `${this.date.toISO()}${FULL_BACKUP_FILE_NAME_SUFFIX}`;
        } else {
            return `${this.date.toISO()}${DELTA_BACKUP_FILE_NAME_SUFFIX}`;
        }
    }
}

export class BackupFile {

    constructor(args: {
        cid: string,
        fileName: BackupFileName,
    }) {
        this.cid = args.cid;
        this.fileName = args.fileName;
    }

    readonly cid: string;

    readonly fileName: BackupFileName;
}

export class Journal implements Iterable<BackupFile> {

    static async read(path: string): Promise<Journal> {
        const journal = new Journal();

        const file = await open(path, 'r');
        const content = (await file.readFile()).toString("utf-8");
        const lines = content.split(/\r?\n/);
        await file.close();

        for(const line of lines) {
            const elements = line.split(/[ \t]+/);
            if(elements.length === 2) {
                const cid = elements[0];
                const fileName = BackupFileName.parse(elements[1]);
                journal.addBackup(new BackupFile({
                    cid,
                    fileName
                }));
            } else if(elements.length === 3) {
                const cid = elements[1];
                const fileName = BackupFileName.parse(elements[2]);
                journal.addBackup(new BackupFile({
                    cid,
                    fileName
                }));
            }
        }

        return journal;
    }

    addBackup(backup: BackupFile) {
        this.backupFiles.push(backup);
    }

    private backupFiles: BackupFile[] = [];

    async write(path: string) {
        const file = await open(path, 'w');
        for(const backupFile of this.backupFiles) {
            await file.write(Buffer.from(`${backupFile.cid} ${backupFile.fileName.fileName}\n`, "utf-8"));
        }
        await file.close();
    }

    isEmpty(): boolean {
        return this.backupFiles.length === 0;
    }

    getLastFullBackup(): BackupFile | undefined {
        for(let i = this.backupFiles.length - 1; i >= 0; --i) {
            const backupFile = this.backupFiles[i];
            if(backupFile.fileName.type === 'FULL') {
                return backupFile;
            }
        }
        return undefined;
    }

    keepOnlyLastFullBackups(maxFullBackups: number): BackupFile[] {
        if(this.backupFiles.length === 0) {
            return [];
        } else {
            let fullBackupIndex = this.getPreviousFullBackup(this.backupFiles.length - 1);

            let fullBackups;
            if(fullBackupIndex > 0) {
                fullBackups = 1;
            } else {
                fullBackups = 0;
            }

            while(fullBackupIndex >= 0 && fullBackups < maxFullBackups) {
                fullBackupIndex = this.getPreviousFullBackup(fullBackupIndex - 1);
                if(fullBackupIndex > 0) {
                    ++fullBackups;
                }
            }

            if(fullBackupIndex > 0) {
                const toRemove = this.backupFiles.slice(0, fullBackupIndex);
                this.backupFiles = this.backupFiles.slice(fullBackupIndex);
                return toRemove;
            } else {
                return [];
            }
        }
    }

    private getPreviousFullBackup(current: number): number {
        let next = current;
        while(next >= 0 && this.backupFiles[next].fileName.type === 'DELTA') {
            --next;
        }
        if(next === 0 && this.backupFiles[next].fileName.type === 'DELTA') {
            return -1;
        } else {
            return next;
        }
    }

    [Symbol.iterator](): Iterator<BackupFile, BackupFile> {
        return this.backupFiles[Symbol.iterator]();
    }
}
