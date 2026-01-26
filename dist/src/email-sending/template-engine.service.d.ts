export interface PersonalizationContext {
    candidate: {
        fullName: string;
        email?: string | null;
    };
    job?: {
        title: string;
    } | null;
    company: {
        name: string;
    };
    sender: {
        firstName: string;
        lastName: string;
    };
}
export declare class TemplateEngineService {
    render(template: string, context: PersonalizationContext): string;
    private getFirstName;
    createSampleContext(): PersonalizationContext;
    extractTokens(template: string): string[];
    validateTokens(template: string): {
        valid: boolean;
        unsupportedTokens: string[];
    };
}
