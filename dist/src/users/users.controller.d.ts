import { UsersService } from './users.service';
import { InviteUserDto, UpdateUserDto } from './dto';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getMe(user: CurrentUserData): Promise<{
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
    updateMe(dto: UpdateUserDto, user: CurrentUserData): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        isActive: boolean;
    }>;
    findAll(user: CurrentUserData): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        isActive: boolean;
    }[]>;
    invite(dto: InviteUserDto, user: CurrentUserData): Promise<{
        user: {
            id: string;
            createdAt: Date;
            email: string;
            firstName: string;
            lastName: string;
            role: import("@prisma/client").$Enums.UserRole;
            isActive: boolean;
        };
        tempPassword: string;
        message: string;
    }>;
    findOne(id: string, user: CurrentUserData): Promise<{
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
    update(id: string, dto: UpdateUserDto, user: CurrentUserData): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        isActive: boolean;
    }>;
    remove(id: string, user: CurrentUserData): Promise<{
        message: string;
    }>;
}
