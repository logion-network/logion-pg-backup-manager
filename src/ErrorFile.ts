import { StateFile } from "./StateFile";

export const ERROR_FLAG_SET = "1";

export const ERROR_FLAG_UNSET = "0";

export class ErrorFile {

    constructor(path: string) {
        this.file = new StateFile(path);
    }

    private file: StateFile;

    async setErrorFlag(flag: boolean) {
        await this.file.resetFile(flag ? ERROR_FLAG_SET : ERROR_FLAG_UNSET);
    }

    async readErrorFlag(): Promise<boolean> {
        const content = await this.file.readFile();
        return content ? content === ERROR_FLAG_SET : false;
    }
}
