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
        if(this.canIgnore({ commandTag, errorSeverity, message, applicationName })) {
            return undefined;
        } else if(this.isStatement(message)) {
            const query = message.substring(STATEMENT_PREFIX.length);
            return query;
        } else if(this.isQuery(message)) {
            const queryStart = message.indexOf(":");
            const query = message.substring(queryStart + 2);
            const parameters = row['14'] as string;
            const parametersRecord = new ParametersExtractor(parameters).extract();
            return this.resolvePlaceholders(query, parametersRecord);
        } else {
            throw new Error(`Invalid row: commandTag=${commandTag}, errorSeverity=${errorSeverity}, message=${message}, applicationName=${applicationName}`);
        }
    }

    canIgnore(params: { commandTag: string, errorSeverity: string, applicationName: string, message: string }): boolean {
        const { commandTag, errorSeverity, applicationName, message} = params;
        return !commandTag
            || errorSeverity !== "LOG"
            || IGNORED_APPLICATIONS.includes(applicationName)
            || this.isError(message);
    }

    isError(message: string): boolean {
        return !(this.isQuery(message) || this.isStatement(message)) &&
            (
                /Connection reset by peer/i.test(message)
                || /unexpected EOF/i.test(message)
            );
    }

    isQuery(message: string): boolean {
        return QUERY.test(message);
    }

    isStatement(message: string): boolean {
        return message.startsWith(STATEMENT_PREFIX);
    }

    private resolvePlaceholders(query: string, parameters: Record<string, string>): string {
        let resolvedQuery = query;
        for(const parameter of Object.keys(parameters)) {
            resolvedQuery = resolvedQuery.replace(parameter, parameters[parameter]);
        }
        return resolvedQuery;
    }
}
