import { exec } from 'child_process';

export interface ShellExecResult {
    stdout: string;
    stderr: string;
}

export abstract class Shell {

    abstract exec(command: string): Promise<ShellExecResult>;
}

export class PosixShell extends Shell {

    async exec(command: string): Promise<ShellExecResult> {
        return new Promise<ShellExecResult>((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
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
}
