import { UserRole } from '@prisma/client';
export declare class UpdateUserDto {
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    isActive?: boolean;
}
