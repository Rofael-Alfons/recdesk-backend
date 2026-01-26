import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto, QueryEmailTemplatesDto, EmailTemplateType } from './dto';
export declare class EmailTemplatesService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    create(dto: CreateEmailTemplateDto, companyId: string): Promise<{
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
    findAll(query: QueryEmailTemplatesDto, companyId: string): Promise<{
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
    findOne(id: string, companyId: string): Promise<{
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
    findDefaultByType(type: EmailTemplateType, companyId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        isDefault: boolean;
        subject: string;
        body: string;
        type: import("@prisma/client").$Enums.EmailTemplateType;
    } | null>;
    update(id: string, dto: UpdateEmailTemplateDto, companyId: string): Promise<{
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
