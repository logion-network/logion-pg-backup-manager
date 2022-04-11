import { exec, spawn } from 'child_process';

export interface ShellExecResult {
    stdout: string;
    stderr: string;
}

export abstract class ProcessHandler {

    async onStdOut(data: any) {

    }

    async onStdErr(data: any) {

    }

    async onClose(code: number | null) {

    }
}

export abstract class Shell {

    abstract exec(command: string): Promise<ShellExecResult>;

    abstract spawn(command: string, args: string[], handler: ProcessHandler): Promise<void>;
}

export class DefaultShell extends Shell {

    async exec(command: string): Promise<ShellExecResult> {
        return new Promise<ShellExecResult>((resolve, reject) => {
            exec(command, {}, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        stdout,
                        stderr
                    });
                }
            });
        });
    }

    async spawn(command: string, args: string[], handler: ProcessHandler): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const process = spawn(command, args);
            process.stdout.on('data', async data => {
                process.stdout.pause();
                await handler.onStdOut(data);
                process.stdout.resume();
            });
            process.stderr.on('data', async data => {
                process.stderr.pause();
                await handler.onStdErr(data);
                process.stderr.resume();
            });
            process.on('close', async code => {
                await handler.onClose(code);
                resolve();
            });
            process.on('error', reject);
        });
    }
}
