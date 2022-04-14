import csv from 'csv-parser';
import fs from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

import { SqlGenerator } from './SqlGenerator';

export type SqlSink = (sql: string | undefined) => Promise<void>;

export type FilePostProcessor = (file: string) => Promise<void>;

export class LogsProcessor {

    constructor(args: {
        sqlSink: SqlSink,
        filePostProcessor: FilePostProcessor
    }) {
        this.csvProcessor = new CsvProcessor({ sqlSink: args.sqlSink });
        this.filePostProcessor = args.filePostProcessor;
    }

    private csvProcessor: CsvProcessor;

    private filePostProcessor: FilePostProcessor;

    async process(directory: string): Promise<void> {
        const files = await readdir(directory);
        files.sort((a, b) => a.localeCompare(b));
        for (let i = 0; i < files.length - 2; ++i) {
            const file = files[i];
            const filePath = path.join(directory, file);
            if(file.endsWith(".csv")) {
                await this.csvProcessor.processCsvFile(filePath);
            }
            await this.filePostProcessor(filePath);
        }
    }
}

export class CsvProcessor {

    constructor(args: {
        sqlSink: SqlSink
    }) {
        this.sqlSink = args.sqlSink;
        this.sqlGenerator = new SqlGenerator();
    }

    private sqlSink: SqlSink;

    private sqlGenerator: SqlGenerator;

    processCsvFile(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const stream = fs.createReadStream(path)
                .pipe(csv({headers: false}))
                .on("data", async data => {
                    stream.pause();
                    try {
                        await this.sqlSink(this.sqlGenerator.generate(data));
                    } catch(e) {
                        reject(e);
                    } finally {
                        stream.resume();
                    }
                })
                .on("error", error => reject(error))
                .on("close", () => resolve());
        });
    }
}
