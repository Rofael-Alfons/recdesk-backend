import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InviteUserDto, UpdateUserDto } from './dto';
import { UserRole } from '@prisma/client';
export declare class UsersService {
    private prisma;
    private configService;
    constructor(prisma: PrismaService, configService: ConfigService);
    findAll(companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    findOne(userId: string, companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        stats: {
            notesCreated: number;
            actionsPerformed: number;
            emailsSent: number;
        };
    }>;
    invite(dto: InviteUserDto, companyId: string, requestingUserRole: UserRole): Promise<{
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: import("@prisma/client").$Enums.UserRole;
            isActive: boolean;
            createdAt: Date;
        };
        tempPassword: string;
        message: string;
    }>;
    update(userId: string, dto: UpdateUserDto, companyId: string, requestingUserId: string, requestingUserRole: UserRole): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(userId: string, companyId: string, requestingUserId: string, requestingUserRole: UserRole): Promise<{
        message: string;
    }>;
    getMe(userId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        company: {
            id: string;
            name: string;
            mode: import("@prisma/client").$Enums.CompanyMode;
            plan: import("@prisma/client").$Enums.PlanType;
        };
    }>;
}
