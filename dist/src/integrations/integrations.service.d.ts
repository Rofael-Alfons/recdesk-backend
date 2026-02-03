import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class IntegrationsService {
    private prisma;
    private configService;
    private oauth2Client;
    constructor(prisma: PrismaService, configService: ConfigService);
    getGmailAuthUrl(companyId: string, userId: string): Promise<{
        authUrl: any;
    }>;
    handleGmailCallback(code: string, state: string): Promise<{
        success: boolean;
        email: string;
        message: string;
    }>;
    getEmailConnections(companyId: string): Promise<{
        id: string;
        createdAt: Date;
        email: string;
        isActive: boolean;
        provider: import("@prisma/client").$Enums.EmailProvider;
        autoImport: boolean;
        lastSyncAt: Date | null;
    }[]>;
    disconnectEmail(connectionId: string, companyId: string): Promise<{
        message: string;
    }>;
    refreshAccessToken(connectionId: string): Promise<any>;
    getValidAccessToken(connectionId: string): Promise<string>;
    updateConnection(connectionId: string, companyId: string, data: {
        autoImport?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        email: string;
        isActive: boolean;
        provider: import("@prisma/client").$Enums.EmailProvider;
        autoImport: boolean;
        lastSyncAt: Date | null;
    }>;
}
