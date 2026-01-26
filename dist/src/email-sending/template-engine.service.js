"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateEngineService = void 0;
const common_1 = require("@nestjs/common");
let TemplateEngineService = class TemplateEngineService {
    render(template, context) {
        const tokens = {
            '{{candidate_name}}': context.candidate.fullName || 'Candidate',
            '{{candidate_first_name}}': this.getFirstName(context.candidate.fullName),
            '{{candidate_email}}': context.candidate.email || '',
            '{{job_title}}': context.job?.title || 'the position',
            '{{company_name}}': context.company.name,
            '{{sender_name}}': `${context.sender.firstName} ${context.sender.lastName}`,
        };
        let result = template;
        for (const [token, value] of Object.entries(tokens)) {
            result = result.split(token).join(value);
        }
        return result;
    }
    getFirstName(fullName) {
        if (!fullName)
            return 'Candidate';
        const parts = fullName.trim().split(/\s+/);
        return parts[0] || 'Candidate';
    }
    createSampleContext() {
        return {
            candidate: {
                fullName: 'John Smith',
                email: 'john.smith@example.com',
            },
            job: {
                title: 'Software Engineer',
            },
            company: {
                name: 'Your Company',
            },
            sender: {
                firstName: 'Jane',
                lastName: 'Doe',
            },
        };
    }
    extractTokens(template) {
        const tokenRegex = /\{\{[^}]+\}\}/g;
        const matches = template.match(tokenRegex);
        return matches ? [...new Set(matches)] : [];
    }
    validateTokens(template) {
        const supportedTokens = [
            '{{candidate_name}}',
            '{{candidate_first_name}}',
            '{{candidate_email}}',
            '{{job_title}}',
            '{{company_name}}',
            '{{sender_name}}',
        ];
        const usedTokens = this.extractTokens(template);
        const unsupportedTokens = usedTokens.filter((token) => !supportedTokens.includes(token));
        return {
            valid: unsupportedTokens.length === 0,
            unsupportedTokens,
        };
    }
};
exports.TemplateEngineService = TemplateEngineService;
exports.TemplateEngineService = TemplateEngineService = __decorate([
    (0, common_1.Injectable)()
], TemplateEngineService);
//# sourceMappingURL=template-engine.service.js.map