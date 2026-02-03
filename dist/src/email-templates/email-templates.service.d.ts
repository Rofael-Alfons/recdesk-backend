import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto, QueryEmailTemplatesDto, EmailTemplateType } from './dto';
export declare class EmailTemplatesService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    create(dto: CreateEmailTemplateDto, companyId: string): Promise<{
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
    findAll(query: QueryEmailTemplatesDto, companyId: string): Promise<{
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
    findOne(id: string, companyId: string): Promise<{
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
    findDefaultByType(type: EmailTemplateType, companyId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        name: string;
        isDefault: boolean;
        type: import("@prisma/client").$Enums.EmailTemplateType;
        body: string;
        subject: string;
    } | null>;
    update(id: string, dto: UpdateEmailTemplateDto, companyId: string): Promise<{
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
    remove(id: string, companyId: string): Promise<{
        message: string;
    }>;
    seedDefaults(companyId: string): Promise<{
        message: string;
        created: number;
        skipped: number;
    }>;
    getAvailableTokens(): {
        token: string;
        description: string;
    }[];
}
