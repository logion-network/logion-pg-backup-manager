import fs from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import csv from 'csv-parser';
import { SqlGenerator } from './SqlGenerator';

export type SqlSink = (sql: string | undefined) => Promise<void>;

export type FilePostProcessor = (file: string) => Promise<void>;

export class LogsProcessor {

    constructor(args: {
        sqlSink: SqlSink,
        filePostProcessor: FilePostProcessor
    }) {
        this.sqlSink = args.sqlSink;
        this.filePostProcessor = args.filePostProcessor;
        this.sqlGenerator = new SqlGenerator();
    }

    private sqlSink: SqlSink;

    private filePostProcessor: FilePostProcessor;

    private sqlGenerator: SqlGenerator;

    async process(directory: string): Promise<void> {
        const files = await readdir(directory);
        files.sort((a, b) => a.localeCompare(b));
        for (let i = 0; i < files.length - 2; ++i) {
            const file = files[i];
            if(file.endsWith(".csv")) {
                await this.processCsvFile(path.join(directory, file));
            }
            await this.filePostProcessor(file);
        }
    }

    private processCsvFile(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const stream = fs.createReadStream(path)
                .pipe(csv({headers: false}))
                .on("data", async data => {
                    stream.pause();
                    try {
                        await this.sqlSink(this.sqlGenerator.generate(data));
                    } finally {
                        stream.resume();
                    }
                })
                .on("error", error => reject(error))
                .on("close", () => resolve());
        });
    }
}
