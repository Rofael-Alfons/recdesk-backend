import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
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
    logout(dto: RefreshTokenDto): Promise<{
        message: string;
    }>;
}
