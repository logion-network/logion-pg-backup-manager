import { FileHandle, open } from "fs/promises";

export class StateFile {

    constructor(path: string) {
        this.path = path;
    }

    readonly path: string;

    async resetFile(content: string) {
        const file = await open(this.path, 'w');
        await file.write(content, null, "utf-8");
        await file.close();
    }

    async readFile(): Promise<string | undefined> {
        let file: FileHandle;
        try {
            file = await open(this.path, 'r');
        } catch {
            return undefined;
        }

        try {
            const content = await file.readFile({ encoding: "utf-8" });
            return content.trim();
        } finally {
            await file.close();
        }
    }
}
