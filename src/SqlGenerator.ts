import { APP_NAME } from "./Command";
import { ParametersExtractor } from "./ParametersExtractor";
import { getLogger } from "./util/Log";

const logger = getLogger();

const STATEMENT_PREFIX = "statement: ";
const QUERY = /^execute [a-z0-9A-Z_<>]+: /;
const IGNORED_APPLICATIONS = [ "pg_restore", APP_NAME ]

export class SqlGenerator {

    /**
     * Converts a CSV log row into an actual SQL statement.
     * 
     * See https://www.postgresql.org/docs/12/runtime-config-logging.html section 19.8.4 for more information about row fields.
     * 
     * @param row A CSV row in the form of an object with fields indexed with the column number (starting with 0).
     * @returns The SQL statement or command, or undefined if none could be built.
     */
    generate(row: any): string | undefined {
        const commandTag = row['7'] as string;
        const errorSeverity = row['11'] as string;
        const message = row['13'] as string;
        const applicationName = row['22'] as string;
        logger.debug(`commandTag=${commandTag} errorSeverity=${errorSeverity} message=${message} applicationName=${applicationName}`);
        if(!commandTag
                || errorSeverity !== "LOG"
                || IGNORED_APPLICATIONS.includes(applicationName)
                || this.isErrorMessage(message)) {
            return undefined;
        } else if(message.startsWith(STATEMENT_PREFIX)) {
            const query = message.substring(STATEMENT_PREFIX.length);
            return query;
        } else if(QUERY.test(message)) {
            const queryStart = message.indexOf(":");
            const query = message.substring(queryStart + 2);
            const parameters = row['14'] as string;
            const parametersRecord = new ParametersExtractor(parameters).extract();
            return this.resolvePlaceholders(query, parametersRecord);
        } else {
            throw new Error(`Invalid row: commandTag=${commandTag}, message=${message}`);
        }
    }

    private resolvePlaceholders(query: string, parameters: Record<string, string>): string {
        let resolvedQuery = query;
        for(const parameter of Object.keys(parameters)) {
            resolvedQuery = resolvedQuery.replace(parameter, parameters[parameter]);
        }
        return resolvedQuery;
    }

    isErrorMessage(message: string): boolean {
        return /Connection reset by peer/i.test(message);
    }
}
