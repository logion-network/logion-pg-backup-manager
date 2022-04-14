import { createLogger, format, Logger, transports as winstonTransports } from 'winston';

const transports = [
    new (winstonTransports.Console)()
]

type LogLevel = 'info' | 'debug' | 'warn' | 'error';

const VALID_LOG_LEVELS: LogLevel[] = [ 'info', 'debug', 'warn', 'error' ];

let LOG_LEVEL: LogLevel = "info";

export function setLogLevel(level: string) {
    if(VALID_LOG_LEVELS.includes(level as LogLevel)) {
        LOG_LEVEL = level as LogLevel;
    } else {
        LOG_LEVEL = "info";
    }
}

class Log {
    private static _logger: Logger | undefined;

    private static create(level: LogLevel): Logger {
        this._logger = createLogger({
            format: format.combine(
                format.splat(),
                format.simple(),
                format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                format.printf(info => `${ info.timestamp } ${ info.level }: ${ info.message }` + (info.splat !== undefined ? `${ info.splat }` : " "))
            ),
            level,
            transports,
            exitOnError: false,
            exceptionHandlers: transports,
        });
        this._logger.log("debug", "Log Level: %s", level)
        return this._logger;
    }

    static get logger(): Logger {
        return this._logger || this.create(LOG_LEVEL);
    }
}

export function getLogger() {
    return Log.logger;
}
