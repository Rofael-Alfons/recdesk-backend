import { ConfigService } from '@nestjs/config';
export type PrefilterAction = 'skip' | 'auto_classify' | 'needs_ai';
export interface PrefilterResult {
    action: PrefilterAction;
    reason: string;
    confidence?: number;
    detectedPosition?: string | null;
}
export interface EmailData {
    subject: string;
    senderEmail: string;
    senderName: string | null;
    bodyText: string;
    bodyHtml?: string;
    attachments: Array<{
        filename: string;
        mimeType: string;
    }>;
    headers?: Record<string, string>;
    companyDomain?: string;
}
export declare class EmailPrefilterService {
    private configService;
    private readonly logger;
    private readonly enabled;
    private readonly autoClassifyEnabled;
    constructor(configService: ConfigService);
    prefilterEmail(email: EmailData): PrefilterResult;
    private checkSkipPatterns;
    private checkJobApplicationPatterns;
    private hasCvAttachment;
    private hasJobKeywords;
    private extractPosition;
    isEnabled(): boolean;
    isAutoClassifyEnabled(): boolean;
}
