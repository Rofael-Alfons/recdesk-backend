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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const uuid_1 = require("uuid");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let UsersService = class UsersService {
    prisma;
    configService;
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
    }
    async findAll(companyId) {
        const users = await this.prisma.user.findMany({
            where: { companyId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return users;
    }
    async findOne(userId, companyId) {
        const user = await this.prisma.user.findFirst({
            where: {
                id: userId,
                companyId,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        candidateNotes: true,
                        candidateActions: true,
                        emailsSent: true,
                    },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            stats: {
                notesCreated: user._count.candidateNotes,
                actionsPerformed: user._count.candidateActions,
                emailsSent: user._count.emailsSent,
            },
        };
    }
    async invite(dto, companyId, requestingUserRole) {
        if (requestingUserRole !== client_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can invite users');
        }
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });
        if (existingUser) {
            throw new common_1.ConflictException('User with this email already exists');
        }
        const tempPassword = (0, uuid_1.v4)().slice(0, 12);
        const saltRounds = this.configService.get('bcrypt.saltRounds') || 12;
        const passwordHash = await bcrypt.hash(tempPassword, saltRounds);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email.toLowerCase(),
                passwordHash,
                firstName: dto.firstName,
                lastName: dto.lastName,
                role: dto.role || client_1.UserRole.RECRUITER,
                companyId,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
        });
        return {
            user,
            tempPassword,
            message: 'User invited successfully. They will receive an email with login instructions.',
        };
    }
    async update(userId, dto, companyId, requestingUserId, requestingUserRole) {
        const targetUser = await this.prisma.user.findFirst({
            where: {
                id: userId,
                companyId,
            },
        });
        if (!targetUser) {
            throw new common_1.NotFoundException('User not found');
        }
        const isSelfUpdate = userId === requestingUserId;
        if (!isSelfUpdate && requestingUserRole !== client_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can update other users');
        }
        if ((dto.role || dto.isActive !== undefined) &&
            requestingUserRole !== client_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can change role or activation status');
        }
        if (dto.role &&
            dto.role !== client_1.UserRole.ADMIN &&
            targetUser.role === client_1.UserRole.ADMIN) {
            const adminCount = await this.prisma.user.count({
                where: {
                    companyId,
                    role: client_1.UserRole.ADMIN,
                    isActive: true,
                },
            });
            if (adminCount <= 1) {
                throw new common_1.BadRequestException('Cannot demote the last admin');
            }
        }
        if (dto.isActive === false && targetUser.role === client_1.UserRole.ADMIN) {
            const activeAdminCount = await this.prisma.user.count({
                where: {
                    companyId,
                    role: client_1.UserRole.ADMIN,
                    isActive: true,
                },
            });
            if (activeAdminCount <= 1) {
                throw new common_1.BadRequestException('Cannot deactivate the last admin');
            }
        }
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(dto.firstName && { firstName: dto.firstName }),
                ...(dto.lastName && { lastName: dto.lastName }),
                ...(dto.role && { role: dto.role }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return updatedUser;
    }
    async remove(userId, companyId, requestingUserId, requestingUserRole) {
        if (requestingUserRole !== client_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can delete users');
        }
        if (userId === requestingUserId) {
            throw new common_1.BadRequestException('You cannot delete your own account');
        }
        const targetUser = await this.prisma.user.findFirst({
            where: {
                id: userId,
                companyId,
            },
        });
        if (!targetUser) {
            throw new common_1.NotFoundException('User not found');
        }
        if (targetUser.role === client_1.UserRole.ADMIN) {
            const adminCount = await this.prisma.user.count({
                where: {
                    companyId,
                    role: client_1.UserRole.ADMIN,
                },
            });
            if (adminCount <= 1) {
                throw new common_1.BadRequestException('Cannot delete the last admin');
            }
        }
        await this.prisma.user.update({
            where: { id: userId },
            data: { isActive: false },
        });
        await this.prisma.refreshToken.deleteMany({
            where: { userId },
        });
        return { message: 'User deactivated successfully' };
    }
    async getMe(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        mode: true,
                        plan: true,
                    },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            company: user.company,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], UsersService);
//# sourceMappingURL=users.service.js.map