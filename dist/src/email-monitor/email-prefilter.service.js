"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailPrefilterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailPrefilterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prefilter_rules_1 = require("./prefilter-rules");
let EmailPrefilterService = EmailPrefilterService_1 = class EmailPrefilterService {
    configService;
    logger = new common_1.Logger(EmailPrefilterService_1.name);
    enabled;
    autoClassifyEnabled;
    constructor(configService) {
        this.configService = configService;
        this.enabled = this.configService.get('prefilter.enabled', true);
        this.autoClassifyEnabled = this.configService.get('prefilter.autoClassifyEnabled', true);
    }
    prefilterEmail(email) {
        if (!this.enabled) {
            return {
                action: 'needs_ai',
                reason: 'Prefilter disabled',
            };
        }
        const skipResult = this.checkSkipPatterns(email);
        if (skipResult) {
            this.logger.debug(`Email skipped: ${skipResult.reason}`);
            return skipResult;
        }
        if (this.autoClassifyEnabled) {
            const autoClassifyResult = this.checkJobApplicationPatterns(email);
            if (autoClassifyResult) {
                this.logger.debug(`Email auto-classified: ${autoClassifyResult.reason}`);
                return autoClassifyResult;
            }
        }
        return {
            action: 'needs_ai',
            reason: 'Email requires AI classification',
        };
    }
    checkSkipPatterns(email) {
        const { subject, senderEmail, bodyText, bodyHtml, attachments, companyDomain, } = email;
        const body = bodyText || bodyHtml || '';
        for (const pattern of prefilter_rules_1.SKIP_PATTERNS.autoReplySubjectPatterns) {
            if (pattern.test(subject)) {
                return {
                    action: 'skip',
                    reason: `Auto-reply detected: subject matches "${pattern.source}"`,
                };
            }
        }
        for (const pattern of prefilter_rules_1.SKIP_PATTERNS.noReplySenderPatterns) {
            if (pattern.test(senderEmail)) {
                return {
                    action: 'skip',
                    reason: `No-reply sender: ${senderEmail}`,
                };
            }
        }
        if (companyDomain &&
            senderEmail.toLowerCase().endsWith(`@${companyDomain.toLowerCase()}`)) {
            return {
                action: 'skip',
                reason: `Internal email from company domain: ${companyDomain}`,
            };
        }
        let newsletterIndicators = 0;
        for (const pattern of prefilter_rules_1.SKIP_PATTERNS.newsletterBodyPatterns) {
            if (pattern.test(body)) {
                newsletterIndicators++;
            }
        }
        if (newsletterIndicators >= 2) {
            return {
                action: 'skip',
                reason: `Newsletter detected: ${newsletterIndicators} indicators found`,
            };
        }
        for (const pattern of prefilter_rules_1.SKIP_PATTERNS.systemEmailPatterns) {
            if (pattern.test(subject) || pattern.test(body)) {
                return {
                    action: 'skip',
                    reason: `System/automated email detected`,
                };
            }
        }
        if (email.headers?.['list-unsubscribe']) {
            return {
                action: 'skip',
                reason: 'Mailing list detected (List-Unsubscribe header)',
            };
        }
        const hasCvAttachment = this.hasCvAttachment(attachments);
        const hasJobKeywords = this.hasJobKeywords(subject, body);
        if (!hasCvAttachment && !hasJobKeywords) {
            return {
                action: 'skip',
                reason: 'No CV attachment and no job-related keywords',
            };
        }
        return null;
    }
    checkJobApplicationPatterns(email) {
        const { subject, bodyText, bodyHtml, attachments } = email;
        const body = bodyText || bodyHtml || '';
        const hasCvAttachment = this.hasCvAttachment(attachments);
        if (hasCvAttachment) {
            for (const pattern of prefilter_rules_1.JOB_APPLICATION_PATTERNS.subjectPatterns) {
                if (pattern.test(subject)) {
                    return {
                        action: 'auto_classify',
                        reason: 'CV attachment + job application subject pattern',
                        confidence: 90,
                        detectedPosition: this.extractPosition(subject, body),
                    };
                }
            }
        }
        if (hasCvAttachment) {
            for (const pattern of prefilter_rules_1.JOB_APPLICATION_PATTERNS.bodyPatterns) {
                if (pattern.test(body)) {
                    return {
                        action: 'auto_classify',
                        reason: 'CV attachment + job application body pattern',
                        confidence: 85,
                        detectedPosition: this.extractPosition(subject, body),
                    };
                }
            }
        }
        if (hasCvAttachment) {
            const cvNamedAttachment = attachments.some((att) => {
                const filename = att.filename.toLowerCase();
                return prefilter_rules_1.JOB_APPLICATION_PATTERNS.cvAttachmentPatterns.some((pattern) => pattern.test(filename));
            });
            if (cvNamedAttachment) {
                return {
                    action: 'auto_classify',
                    reason: 'CV attachment with CV-like filename',
                    confidence: 80,
                    detectedPosition: this.extractPosition(subject, body),
                };
            }
        }
        return null;
    }
    hasCvAttachment(attachments) {
        return attachments.some((att) => {
            const ext = att.filename
                .toLowerCase()
                .slice(att.filename.lastIndexOf('.'));
            return (prefilter_rules_1.CV_FILE_EXTENSIONS.includes(ext) || prefilter_rules_1.CV_MIME_TYPES.includes(att.mimeType));
        });
    }
    hasJobKeywords(subject, body) {
        const text = `${subject} ${body}`.toLowerCase();
        const jobKeywords = [
            'job',
            'position',
            'role',
            'vacancy',
            'opening',
            'application',
            'applying',
            'apply',
            'candidate',
            'cv',
            'resume',
            'curriculum vitae',
            'hiring',
            'recruitment',
            'opportunity',
        ];
        return jobKeywords.some((keyword) => text.includes(keyword));
    }
    extractPosition(subject, body) {
        const text = `${subject} ${body}`;
        const positionPatterns = [
            /(?:application|applying|apply)\s+(?:for|to)\s+(?:the\s+)?(?:position\s+(?:of\s+)?)?([^.,\n]+)/i,
            /(?:position|role|job)\s*(?:of|:)?\s*([^.,\n]+)/i,
            /interested\s+in\s+(?:the\s+)?([^.,\n]+)\s+(?:position|role|job)/i,
        ];
        for (const pattern of positionPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const position = match[1].trim();
                if (position.length > 3 && position.length < 100) {
                    return position;
                }
            }
        }
        return null;
    }
    isEnabled() {
        return this.enabled;
    }
    isAutoClassifyEnabled() {
        return this.autoClassifyEnabled;
    }
};
exports.EmailPrefilterService = EmailPrefilterService;
exports.EmailPrefilterService = EmailPrefilterService = EmailPrefilterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailPrefilterService);
//# sourceMappingURL=email-prefilter.service.js.map