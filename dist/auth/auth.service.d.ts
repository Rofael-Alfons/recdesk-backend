import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
export declare class AuthService {
    private prisma;
    private jwtService;
    private configService;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: import("@prisma/client").$Enums.UserRole;
            company: {
                id: string;
                name: string;
                mode: import("@prisma/client").$Enums.CompanyMode;
                plan: import("@prisma/client").$Enums.PlanType;
            };
        };
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: import("@prisma/client").$Enums.UserRole;
            company: {
                id: string;
                name: string;
                mode: import("@prisma/client").$Enums.CompanyMode;
                plan: import("@prisma/client").$Enums.PlanType;
            };
        };
    }>;
    refreshTokens(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: import("@prisma/client").$Enums.UserRole;
            company: {
                id: string;
                name: string;
                mode: import("@prisma/client").$Enums.CompanyMode;
                plan: import("@prisma/client").$Enums.PlanType;
            };
        };
    }>;
    logout(refreshToken: string): Promise<void>;
    private generateTokens;
}
