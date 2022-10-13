import { SqlGenerator } from "../src/SqlGenerator";

const REGULAR_LOG = {
    '11': 'LOG',
    '13': 'database system is ready to accept connections'
};

const STATEMENT_INSTRUCTION = 'CREATE EXTENSION IF NOT EXISTS pgcrypto';

const STATEMENT = {
    '7': "idle",
    '11': 'LOG',
    '13': `statement: ${STATEMENT_INSTRUCTION}`
};

const EXECUTE_INSTRUCTION = 'INSERT INTO "protection_request"("id", "address_to_recover", "created_on", "is_recovery", "requester_address", "email", "first_name", "last_name", "phone_number", "city", "country", "line1", "line2", "postal_code", "status", "other_legal_officer_address", "decision_on", "reject_reason", "loc_id") VALUES ($1, DEFAULT, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, DEFAULT, DEFAULT, DEFAULT)';

const EXECUTE = {
    '7': "INSERT",
    '11': 'LOG',
    '13': `execute <unnamed>: ${EXECUTE_INSTRUCTION}`,
    '14': "parameters: $1 = '41de0a6d-1fd2-49e7-a5f2-f28952233007', $2 = '2022-04-05 09:33:23.219', $3 = 'f', $4 = '5EBxoSssqNo23FvsDeUxjyQScnfEiGxJaNwuwqBH2Twe35BX', $5 = 'gerard@logion.network', $6 = 'Gérard', $7 = 'Dethier', $8 = '+1234', $9 = '?', $10 = '?', $11 = '?', $12 = '?', $13 = '?', $14 = 'PENDING', $15 = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'"
};

const RESOLVED_EXECUTE_INSTRUCTION = `INSERT INTO "protection_request"("id", "address_to_recover", "created_on", "is_recovery", "requester_address", "email", "first_name", "last_name", "phone_number", "city", "country", "line1", "line2", "postal_code", "status", "other_legal_officer_address", "decision_on", "reject_reason", "loc_id") VALUES ('41de0a6d-1fd2-49e7-a5f2-f28952233007', DEFAULT, '2022-04-05 09:33:23.219', 'f', '5EBxoSssqNo23FvsDeUxjyQScnfEiGxJaNwuwqBH2Twe35BX', 'gerard@logion.network', 'Gérard', 'Dethier', '+1234', '?', '?', '?', '?', '?', 'PENDING', '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', DEFAULT, DEFAULT, DEFAULT)`

const ERROR = {
    '7': "idle",
    '11': "LOG",
    '13': "could not receive data from client: Connection reset by peer",
    '22': "psql"
};

describe("SqlGenerator", () => {

    it("returns undefined if regular log", () => {
        const sqlGenerator = new SqlGenerator();
        const sql = sqlGenerator.generate(REGULAR_LOG);
        expect(sql).toBeUndefined();
    });

    it("returns statement instruction if statement", () => {
        const sqlGenerator = new SqlGenerator();
        const sql = sqlGenerator.generate(STATEMENT);
        expect(sql).toBe(STATEMENT_INSTRUCTION);
    });

    it("returns resolved query if execute", () => {
        const sqlGenerator = new SqlGenerator();
        const sql = sqlGenerator.generate(EXECUTE);
        expect(sql).toBe(RESOLVED_EXECUTE_INSTRUCTION);
    });

    it("returns undefined if error message", () => {
        const sqlGenerator = new SqlGenerator();
        const sql = sqlGenerator.generate(ERROR);
        expect(sql).toBeUndefined();
    });
});
