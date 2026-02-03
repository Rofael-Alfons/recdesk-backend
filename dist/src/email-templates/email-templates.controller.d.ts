import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto, QueryEmailTemplatesDto } from './dto';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class EmailTemplatesController {
    private emailTemplatesService;
    constructor(emailTemplatesService: EmailTemplatesService);
    create(dto: CreateEmailTemplateDto, user: CurrentUserData): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        isDefault: boolean;
        subject: string;
        body: string;
        type: import("@prisma/client").$Enums.EmailTemplateType;
    }>;
    findAll(query: QueryEmailTemplatesDto, user: CurrentUserData): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        isDefault: boolean;
        subject: string;
        body: string;
        type: import("@prisma/client").$Enums.EmailTemplateType;
    }[]>;
    getTokens(): Promise<{
        token: string;
        description: string;
    }[]>;
    findOne(id: string, user: CurrentUserData): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        isDefault: boolean;
        subject: string;
        body: string;
        type: import("@prisma/client").$Enums.EmailTemplateType;
    }>;
    update(id: string, dto: UpdateEmailTemplateDto, user: CurrentUserData): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        isDefault: boolean;
        subject: string;
        body: string;
        type: import("@prisma/client").$Enums.EmailTemplateType;
    }>;
    remove(id: string, user: CurrentUserData): Promise<{
        message: string;
    }>;
    seedDefaults(user: CurrentUserData): Promise<{
        message: string;
        created: number;
        skipped: number;
    }>;
}
