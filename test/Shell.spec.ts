import { DefaultShell, ProcessHandler } from "../src/Shell";

describe("DefaultShell", () => {

    const shell = new DefaultShell();

    it("detects error on exec", async () => {
        try {
            await shell.exec("sdlifjf");
            expect(true).toBe(false);
        } catch(e) {
            expect(true).toBe(true);
        }
    });

    it("detects error on spawn", async () => {
        try {
            await shell.spawn("sdlifjf", [], new NullProcessHandler());
            expect(true).toBe(false);
        } catch(e) {
            expect(true).toBe(true);
        }
    });
});

class NullProcessHandler extends ProcessHandler {

}