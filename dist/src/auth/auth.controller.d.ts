import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
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
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        resetLink?: string | undefined;
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
}
