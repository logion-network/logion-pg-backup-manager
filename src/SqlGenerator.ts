import { ParametersExtractor } from "./ParametersExtractor";

const STATEMENT_PREFIX = "statement: ";
const UNNAMED_QUERY = "execute <unnamed>: ";

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
        const message = row['13'] as string;
        if(!commandTag) {
            return undefined;
        } else if(message.startsWith(STATEMENT_PREFIX)) {
            const query = message.substring(STATEMENT_PREFIX.length);
            return query;
        } else if(message.startsWith(UNNAMED_QUERY)) {
            const query = message.substring(UNNAMED_QUERY.length);
            const parameters = row['14'] as string;
            const parametersRecord = new ParametersExtractor(parameters).extract();
            return this.resolvePlaceholders(query, parametersRecord) + ';';
        } else {
            throw new Error("Invalid row");
        }
    }

    private resolvePlaceholders(query: string, parameters: Record<string, string>): string {
        let resolvedQuery = query;
        for(const parameter of Object.keys(parameters)) {
            resolvedQuery = resolvedQuery.replace(parameter, parameters[parameter]);
        }
        return resolvedQuery;
    }
}
