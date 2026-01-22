"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const uuid_1 = require("uuid");
const prisma_service_1 = require("../prisma/prisma.service");
const crypto = __importStar(require("crypto"));
let AuthService = class AuthService {
    prisma;
    jwtService;
    configService;
    constructor(prisma, jwtService, configService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
    }
    async register(dto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });
        if (existingUser) {
            throw new common_1.ConflictException('User with this email already exists');
        }
        const saltRounds = this.configService.get('bcrypt.saltRounds') || 12;
        const passwordHash = await bcrypt.hash(dto.password, saltRounds);
        const result = await this.prisma.$transaction(async (prisma) => {
            const company = await prisma.company.create({
                data: {
                    name: dto.companyName,
                    domain: dto.companyDomain?.toLowerCase(),
                    mode: dto.companyMode || 'FULL_ATS',
                },
            });
            const user = await prisma.user.create({
                data: {
                    email: dto.email.toLowerCase(),
                    passwordHash,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    role: 'ADMIN',
                    companyId: company.id,
                },
                include: { company: true },
            });
            return user;
        });
        const tokens = await this.generateTokens(result);
        return {
            user: {
                id: result.id,
                email: result.email,
                firstName: result.firstName,
                lastName: result.lastName,
                role: result.role,
                company: {
                    id: result.company.id,
                    name: result.company.name,
                    mode: result.company.mode,
                    plan: result.company.plan,
                },
            },
            ...tokens,
        };
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
            include: { company: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.isActive) {
            throw new common_1.UnauthorizedException('Account is deactivated');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const tokens = await this.generateTokens(user);
        return {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                company: {
                    id: user.company.id,
                    name: user.company.name,
                    mode: user.company.mode,
                    plan: user.company.plan,
                },
            },
            ...tokens,
        };
    }
    async refreshTokens(dto) {
        const refreshToken = await this.prisma.refreshToken.findUnique({
            where: { token: dto.refreshToken },
            include: { user: { include: { company: true } } },
        });
        if (!refreshToken) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (new Date() > refreshToken.expiresAt) {
            await this.prisma.refreshToken.deleteMany({
                where: { id: refreshToken.id },
            });
            throw new common_1.UnauthorizedException('Refresh token expired');
        }
        if (!refreshToken.user.isActive) {
            throw new common_1.UnauthorizedException('Account is deactivated');
        }
        await this.prisma.refreshToken.deleteMany({
            where: { id: refreshToken.id },
        });
        const tokens = await this.generateTokens(refreshToken.user);
        return {
            user: {
                id: refreshToken.user.id,
                email: refreshToken.user.email,
                firstName: refreshToken.user.firstName,
                lastName: refreshToken.user.lastName,
                role: refreshToken.user.role,
                company: {
                    id: refreshToken.user.company.id,
                    name: refreshToken.user.company.name,
                    mode: refreshToken.user.company.mode,
                    plan: refreshToken.user.company.plan,
                },
            },
            ...tokens,
        };
    }
    async logout(refreshToken) {
        await this.prisma.refreshToken.deleteMany({
            where: { token: refreshToken },
        });
    }
    async generateTokens(user) {
        const payload = {
            sub: user.id,
            email: user.email,
            companyId: user.companyId,
            role: user.role,
        };
        const accessExpirationSeconds = this.configService.get('jwt.accessExpirationSeconds') || 900;
        const accessToken = this.jwtService.sign(payload, {
            expiresIn: accessExpirationSeconds,
        });
        const refreshToken = (0, uuid_1.v4)();
        const refreshExpirationSeconds = this.configService.get('jwt.refreshExpirationSeconds') || 604800;
        const expiresAt = new Date(Date.now() + refreshExpirationSeconds * 1000);
        await this.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });
        return {
            accessToken,
            refreshToken,
        };
    }
    async forgotPassword(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });
        if (!user || !user.isActive) {
            return {
                message: 'If an account exists with this email, a password reset link has been sent.',
            };
        }
        await this.prisma.passwordResetToken.updateMany({
            where: { userId: user.id, used: false },
            data: { used: true },
        });
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await this.prisma.passwordResetToken.create({
            data: {
                token,
                userId: user.id,
                expiresAt,
            },
        });
        const frontendUrl = this.configService.get('frontend.url') || 'http://localhost:3000';
        const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`;
        console.log(`[DEV] Password reset link for ${user.email}: ${resetLink}`);
        return {
            message: 'If an account exists with this email, a password reset link has been sent.',
            ...(process.env.NODE_ENV !== 'production' && { resetLink }),
        };
    }
    async resetPassword(dto) {
        const resetToken = await this.prisma.passwordResetToken.findUnique({
            where: { token: dto.token },
            include: { user: true },
        });
        if (!resetToken) {
            throw new common_1.BadRequestException('Invalid or expired reset token');
        }
        if (resetToken.used) {
            throw new common_1.BadRequestException('This reset link has already been used');
        }
        if (new Date() > resetToken.expiresAt) {
            throw new common_1.BadRequestException('Reset link has expired');
        }
        if (!resetToken.user.isActive) {
            throw new common_1.BadRequestException('Account is deactivated');
        }
        const saltRounds = this.configService.get('bcrypt.saltRounds') || 12;
        const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);
        await this.prisma.$transaction(async (prisma) => {
            await prisma.user.update({
                where: { id: resetToken.userId },
                data: { passwordHash },
            });
            await prisma.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { used: true },
            });
            await prisma.refreshToken.deleteMany({
                where: { userId: resetToken.userId },
            });
        });
        return {
            message: 'Password has been reset successfully. Please login with your new password.',
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map