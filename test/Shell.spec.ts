import { Writable } from "stream";
import { DefaultShell, ProcessHandler } from "../src/Shell";

describe("DefaultShell", () => {

    const shell = new DefaultShell();

    it("detects error on exec from failure", async () => {
        try {
            await shell.exec("sdlifjf");
            expect(true).toBe(false);
        } catch(e) {
            expect(true).toBe(true);
        }
    });

    it("detects error on spawn from failure", async () => {
        try {
            await shell.spawn("sdlifjf", [], new NullProcessHandler());
            expect(true).toBe(false);
        } catch(e) {
            expect(true).toBe(true);
        }
    });

    it("detects error on exec from exit code", async () => {
        try {
            await shell.exec("( exit 1 )");
            expect(true).toBe(false);
        } catch(e) {
            expect(true).toBe(true);
        }
    });

    it("detects error on spawn from exit code", async () => {
        try {
            await shell.spawn("( exit 1 )", [], new NullProcessHandler());
            expect(true).toBe(false);
        } catch(e) {
            expect(true).toBe(true);
        }
    });

    it("pipes properly", async () => {
        const message = "test";
        const handler = new PipeProcessHandler(message);
        await shell.spawn("cat", [], handler);
        expect(handler.output).toBe(message);
    });
});

class NullProcessHandler extends ProcessHandler {

}

class PipeProcessHandler extends ProcessHandler {

    constructor(message: string) {
        super();
        this.message = message;
    }

    private message: string;

    async onStdOut(data: any): Promise<void> {
        this._output = data.toString("utf-8");
    }

    private _output?: string;

    get output(): string | undefined {
        return this._output;
    }

    async onStdIn(stdin: Writable) {
        await new Promise<void>((resolve, reject) => {
            stdin.write(this.message, error => {
                if(error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
        stdin.end();
    }
}
