import { EmailMonitorService } from './email-monitor.service';
interface AuthUser {
    userId: string;
    companyId: string;
    email: string;
    role: string;
}
export declare class EmailMonitorController {
    private emailMonitorService;
    constructor(emailMonitorService: EmailMonitorService);
    triggerSync(user: AuthUser): Promise<{
        results: import("./email-monitor.service").SyncResult[];
        totalImported: number;
    }>;
    triggerSyncForConnection(connectionId: string, user: AuthUser): Promise<import("./email-monitor.service").SyncResult>;
    getSyncStatus(user: AuthUser): Promise<{
        id: string;
        email: string;
        isActive: boolean;
        autoImport: boolean;
        lastSyncAt: Date | null;
        totalEmailsProcessed: number;
    }[]>;
    getConnectionSyncStatus(connectionId: string, user: AuthUser): Promise<{
        id: string;
        email: string;
        isActive: boolean;
        autoImport: boolean;
        lastSyncAt: Date | null;
        totalEmailsProcessed: number;
        recentEmails: {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.EmailImportStatus;
            subject: string | null;
            senderEmail: string;
            isJobApplication: boolean;
            confidence: number | null;
        }[];
    }>;
}
export {};
