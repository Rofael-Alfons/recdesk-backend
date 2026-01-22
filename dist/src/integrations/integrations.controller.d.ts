import type { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { UpdateConnectionDto } from './dto/update-connection.dto';
export declare class IntegrationsController {
    private integrationsService;
    private configService;
    constructor(integrationsService: IntegrationsService, configService: ConfigService);
    getConnections(user: CurrentUserData): Promise<{
        id: string;
        provider: import("@prisma/client").$Enums.EmailProvider;
        email: string;
        isActive: boolean;
        autoImport: boolean;
        lastSyncAt: Date | null;
        createdAt: Date;
    }[]>;
    connectGmail(user: CurrentUserData): Promise<{
        authUrl: any;
    }>;
    gmailCallback(code: string, state: string, error: string, res: Response): Promise<void>;
    updateConnection(id: string, updateDto: UpdateConnectionDto, user: CurrentUserData): Promise<{
        id: string;
        provider: import("@prisma/client").$Enums.EmailProvider;
        email: string;
        isActive: boolean;
        autoImport: boolean;
        lastSyncAt: Date | null;
        createdAt: Date;
    }>;
    disconnect(id: string, user: CurrentUserData): Promise<{
        message: string;
    }>;
}
