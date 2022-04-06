export class ParametersExtractor {

    constructor(parameters: string) {
        this.detail = parameters;
    }

    private detail: string;

    extract(): Record<string, string> {
        const parameters: Record<string, string> = {};
        const parametersIndexes: number[] = this.getParametersIndexes();
        for(let i = 0; i < parametersIndexes.length - 1; ++i) {
            const paramValue = this.getParameterValue(parametersIndexes[i], parametersIndexes[i + 1]);
            parameters[`$${i + 1}`] = paramValue;
        }
        if(parametersIndexes.length > 0) {
            const parameterIndex = parametersIndexes[parametersIndexes.length - 1];
            const valueStart = this.getParameterValueStart(parameterIndex);
            const paramValue = this.detail.substring(valueStart);
            parameters[`$${parametersIndexes.length}`] = paramValue;
        }
        return parameters;
    }

    private getParametersIndexes(): number[] {
        const parametersIndexes: number[] = [];

        let paramNumber = 1;
        let index = this.detail.indexOf(`$${paramNumber}`);
        if(index >= 0) {
            parametersIndexes.push(index);
        }
        ++paramNumber;

        while(index < this.detail.length - 1) {
            index = this.detail.indexOf(`$${paramNumber}`, index + 1);
            if(index >= 0) {
                parametersIndexes.push(index);
            } else {
                index = this.detail.length; // No more parameters to find
            }
            ++paramNumber;
        }
        return parametersIndexes;
    }

    private getParameterValue(parameterIndex: number, nextParameterIndex: number): string {
        const valueStart = this.getParameterValueStart(parameterIndex);
        const valueEnd = this.getParameterValueEnd(nextParameterIndex - 1);
        return this.detail.substring(valueStart, valueEnd);
    }

    private getParameterValueStart(index: number): number {
        let start = index;
        while(start < this.detail.length && this.isValuePrefixChar(start)) {
            ++start;
        }
        return start;
    }

    private isValuePrefixChar(index: number): boolean {
        const char = this.detail.charAt(index);
        return /[\$0-9 =]/.test(char);
    }

    private getParameterValueEnd(index: number): number {
        let start = index;
        while(start >= 0 && this.isValueSuffixChar(start)) {
            --start;
        }
        return start + 1;
    }

    private isValueSuffixChar(index: number): boolean {
        const char = this.detail.charAt(index);
        return /[ ,]/.test(char);
    }
}
