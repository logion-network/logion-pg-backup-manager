import { StateFile } from "./StateFile";

export type ErrorState = "None" | "BackupFailure" | "EmailJournalFailure" | "EmailErrorFailure";

export class ErrorFile {

    constructor(path: string) {
        this.file = new StateFile(path);
    }

    private file: StateFile;

    async setErrorState(flag: ErrorState) {
        await this.file.resetFile(flag);
    }

    async getErrorState(): Promise<ErrorState> {
        const content = await this.file.readFile();
        if(content === undefined
            || content === "0") { // Legacy
            return "None";
        }

        if(content === "1") { // Legacy
            return "BackupFailure";
        }

        if(this.isErrorState(content)) {
            return content;
        } else {
            return "None";
        }
    }

    private isErrorState(state: string): state is ErrorState {
        return state === "None"
            || state === "BackupFailure"
            || state === "EmailJournalFailure"
            || state === "EmailErrorFailure"
        ;
    }
}
