import { ConfigService } from '@nestjs/config';
import { gmail_v1 } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { AiService } from '../ai/ai.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { EmailPrefilterService } from './email-prefilter.service';
export interface GmailMessage {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    historyId: string;
    internalDate: string;
    payload: gmail_v1.Schema$MessagePart;
}
export interface EmailAttachment {
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
    data?: Buffer;
}
export interface SyncResult {
    connectionId: string;
    email: string;
    emailsProcessed: number;
    emailsImported: number;
    emailsSkipped: number;
    errors: string[];
}
export declare class EmailMonitorService {
    private prisma;
    private configService;
    private integrationsService;
    private aiService;
    private fileProcessingService;
    private emailPrefilterService;
    private notificationsService;
    private billingService;
    private readonly logger;
    private oauth2Client;
    private uploadDir;
    constructor(prisma: PrismaService, configService: ConfigService, integrationsService: IntegrationsService, aiService: AiService, fileProcessingService: FileProcessingService, emailPrefilterService: EmailPrefilterService, notificationsService: NotificationsService, billingService: BillingService);
    private ensureUploadDir;
    pollEmailsForConnection(connectionId: string, companyId?: string): Promise<SyncResult>;
    private fetchNewEmails;
    private getMessageDetails;
    private processEmail;
    private extractEmailData;
    private extractEmail;
    private extractName;
    extractAttachments(gmail: gmail_v1.Gmail, message: GmailMessage): Promise<EmailAttachment[]>;
    processAttachment(gmail: gmail_v1.Gmail, attachment: EmailAttachment, messageId: string, emailImport: any, companyId: string, detectedPosition?: string | null): Promise<void>;
    private createCandidateFromEmail;
    private scoreCandidate;
    private extractNameFromFilename;
    private extractBasicDataFromFilename;
    syncAllConnectionsForCompany(companyId: string): Promise<{
        results: SyncResult[];
        totalImported: number;
    }>;
    getSyncStatus(companyId: string): Promise<{
        id: string;
        email: string;
        isActive: boolean;
        autoImport: boolean;
        lastSyncAt: Date | null;
        totalEmailsProcessed: number;
    }[]>;
    getConnectionSyncStatus(connectionId: string, companyId: string): Promise<{
        id: string;
        email: string;
        isActive: boolean;
        autoImport: boolean;
        lastSyncAt: Date | null;
        totalEmailsProcessed: number;
        recentEmails: {
            id: string;
            status: import("@prisma/client").$Enums.EmailImportStatus;
            createdAt: Date;
            subject: string | null;
            senderEmail: string;
            isJobApplication: boolean;
            confidence: number | null;
        }[];
    }>;
    refreshConnectionToken(connectionId: string): Promise<void>;
}
