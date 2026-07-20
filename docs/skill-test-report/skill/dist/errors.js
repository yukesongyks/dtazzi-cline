export class TestReportError extends Error {
    code;
    diagnostic;
    cause;
    constructor(code, message, opts) {
        super(message);
        this.name = "TestReportError";
        this.code = code;
        if (opts) {
            this.diagnostic = opts.diagnostic;
            this.cause = opts.cause;
        }
    }
    toSkillError() {
        return {
            code: this.code,
            message: this.message,
            diagnostic: this.diagnostic,
            cause: this.cause,
        };
    }
}
