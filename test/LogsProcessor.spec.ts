import { LogsProcessor } from "../src/LogsProcessor";

describe("LogsProcessor", () => {

    it("successfully processes sample logs", async () => {
        const sqlLines: string[] = [];
        const logsProcessor = new LogsProcessor({
            sqlSink: (sql) => {
                if(sql) {
                    sqlLines.push(sql);
                }
                return Promise.resolve();
            },
            filePostProcessor: () => Promise.resolve()
        });

        await logsProcessor.process("sample_logs");

        expect(sqlLines.length).toBe(168);
    });
});
