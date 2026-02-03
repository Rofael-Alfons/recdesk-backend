import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto, QueryEmailTemplatesDto } from './dto';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class EmailTemplatesController {
    private emailTemplatesService;
    constructor(emailTemplatesService: EmailTemplatesService);
    create(dto: CreateEmailTemplateDto, user: CurrentUserData): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        name: string;
        isDefault: boolean;
        type: import("@prisma/client").$Enums.EmailTemplateType;
        body: string;
        subject: string;
    }>;
    findAll(query: QueryEmailTemplatesDto, user: CurrentUserData): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        name: string;
        isDefault: boolean;
        type: import("@prisma/client").$Enums.EmailTemplateType;
        body: string;
        subject: string;
    }[]>;
    getTokens(): Promise<{
        token: string;
        description: string;
    }[]>;
    findOne(id: string, user: CurrentUserData): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        name: string;
        isDefault: boolean;
        type: import("@prisma/client").$Enums.EmailTemplateType;
        body: string;
        subject: string;
    }>;
    update(id: string, dto: UpdateEmailTemplateDto, user: CurrentUserData): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        name: string;
        isDefault: boolean;
        type: import("@prisma/client").$Enums.EmailTemplateType;
        body: string;
        subject: string;
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
