import { BackupManagerCommand } from "./Command";
import { getLogger } from "./util/Log";

const logger = getLogger();

export class Pause extends BackupManagerCommand {

    static NAME = "Pause";

    async trigger(): Promise<void> {
        logger.info("Backup manager paused, waiting for next command.");
    }

    get name(): string {
        return Pause.NAME;
    }
}
