import { ParametersExtractor } from "../src/ParametersExtractor";

describe("ParametersExtractor", () => {

    it("returns empty record with empty string", () => {
        const parameters = extractFrom("");
        expect(Object.keys(parameters).length).toBe(0);
    });

    it("returns empty record with no parameters", () => {
        const parameters = extractFrom("parameters:");
        expect(Object.keys(parameters).length).toBe(0);
    });

    it("returns record with single parameter", () => {
        const parameters = extractFrom("parameters: $1 = 'abc'");
        expect(Object.keys(parameters).length).toBe(1);
        expect(parameters['$1']).toBe("'abc'");
    });

    it("returns record with multiple parameters", () => {
        const parameters = extractFrom("parameters: $1 = 'abc', $2 = 'def', $3 = 'ghi'");
        expect(Object.keys(parameters).length).toBe(3);
        expect(parameters['$1']).toBe("'abc'");
        expect(parameters['$2']).toBe("'def'");
        expect(parameters['$3']).toBe("'ghi'");
    });
});

function extractFrom(parameters: string): Record<string, string> {
    const extractor = new ParametersExtractor(parameters);
    return extractor.extract();
}
