import { UserRole } from '@prisma/client';
export declare class InviteUserDto {
    email: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
}
