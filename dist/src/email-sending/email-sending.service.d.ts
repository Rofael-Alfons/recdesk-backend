import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { TemplateEngineService } from './template-engine.service';
import { BillingService } from '../billing/billing.service';
import { SendEmailDto, BulkSendEmailDto, PreviewEmailDto } from './dto';
export interface SendResult {
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    success: boolean;
    error?: string;
}
export declare class EmailSendingService {
    private prisma;
    private configService;
    private emailTemplatesService;
    private templateEngine;
    private billingService;
    private readonly logger;
    private readonly fromEmail;
    private readonly isConfigured;
    constructor(prisma: PrismaService, configService: ConfigService, emailTemplatesService: EmailTemplatesService, templateEngine: TemplateEngineService, billingService: BillingService);
    sendEmail(dto: SendEmailDto, userId: string, companyId: string): Promise<SendResult>;
    bulkSendEmails(dto: BulkSendEmailDto, userId: string, companyId: string): Promise<{
        total: number;
        successful: number;
        failed: number;
        results: SendResult[];
    }>;
    previewEmail(dto: PreviewEmailDto, companyId: string, userId: string): Promise<{
        subject: string;
        body: string;
        tokens: string[];
    }>;
    getSentEmails(companyId: string, options?: {
        candidateId?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        data: ({
            candidate: {
                id: string;
                email: string | null;
                fullName: string;
            };
            sentBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            id: string;
            candidateId: string;
            subject: string;
            body: string;
            sentAt: Date;
            openedAt: Date | null;
            clickedAt: Date | null;
            sentById: string;
        })[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    private sendViaProvider;
}
