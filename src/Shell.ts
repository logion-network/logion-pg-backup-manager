import { spawn } from 'child_process';

export abstract class ProcessHandler {

    async onStdOut(data: any) {

    }

    async onStdErr(data: any) {

    }

    async onClose(code: number | null) {

    }
}

export abstract class Shell {

    abstract spawn(command: string, args: string[], handler: ProcessHandler): Promise<void>;
}

export class DefaultShell extends Shell {

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
