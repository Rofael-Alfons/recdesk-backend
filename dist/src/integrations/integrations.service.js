"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const googleapis_1 = require("googleapis");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let IntegrationsService = class IntegrationsService {
    prisma;
    configService;
    oauth2Client;
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
        const clientId = this.configService.get('google.clientId');
        const clientSecret = this.configService.get('google.clientSecret');
        const redirectUri = this.configService.get('google.redirectUri');
        this.oauth2Client = new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
    }
    async getGmailAuthUrl(companyId, userId) {
        const state = Buffer.from(JSON.stringify({ companyId, userId })).toString('base64');
        const scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/userinfo.email',
        ];
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state,
            prompt: 'consent',
        });
        return { authUrl };
    }
    async handleGmailCallback(code, state) {
        let stateData;
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        }
        catch {
            throw new common_1.BadRequestException('Invalid state parameter');
        }
        const { companyId, userId } = stateData;
        const user = await this.prisma.user.findFirst({
            where: { id: userId, companyId },
        });
        if (!user) {
            throw new common_1.BadRequestException('Invalid user or company');
        }
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            if (!tokens.access_token) {
                throw new common_1.BadRequestException('Failed to obtain access token');
            }
            this.oauth2Client.setCredentials(tokens);
            const oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const { data: userInfo } = await oauth2.userinfo.get();
            if (!userInfo.email) {
                throw new common_1.BadRequestException('Failed to get email from Google');
            }
            const existingConnection = await this.prisma.emailConnection.findFirst({
                where: {
                    companyId,
                    email: userInfo.email,
                },
            });
            if (existingConnection) {
                await this.prisma.emailConnection.update({
                    where: { id: existingConnection.id },
                    data: {
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token || existingConnection.refreshToken,
                        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                        isActive: true,
                    },
                });
            }
            else {
                await this.prisma.emailConnection.create({
                    data: {
                        provider: client_1.EmailProvider.GMAIL,
                        email: userInfo.email,
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token || null,
                        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                        isActive: true,
                        companyId,
                    },
                });
            }
            return {
                success: true,
                email: userInfo.email,
                message: 'Gmail connected successfully',
            };
        }
        catch (error) {
            console.error('Gmail OAuth error:', error);
            throw new common_1.InternalServerErrorException('Failed to connect Gmail account');
        }
    }
    async getEmailConnections(companyId) {
        const connections = await this.prisma.emailConnection.findMany({
            where: { companyId },
            select: {
                id: true,
                provider: true,
                email: true,
                isActive: true,
                autoImport: true,
                lastSyncAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return connections;
    }
    async disconnectEmail(connectionId, companyId) {
        const connection = await this.prisma.emailConnection.findFirst({
            where: { id: connectionId, companyId },
        });
        if (!connection) {
            throw new common_1.NotFoundException('Email connection not found');
        }
        if (connection.accessToken) {
            try {
                await this.oauth2Client.revokeToken(connection.accessToken);
            }
            catch (error) {
                console.warn('Failed to revoke token:', error);
            }
        }
        await this.prisma.emailConnection.delete({
            where: { id: connectionId },
        });
        return { message: 'Email disconnected successfully' };
    }
    async refreshAccessToken(connectionId) {
        const connection = await this.prisma.emailConnection.findUnique({
            where: { id: connectionId },
        });
        if (!connection || !connection.refreshToken) {
            throw new common_1.BadRequestException('Cannot refresh token - no refresh token available');
        }
        try {
            this.oauth2Client.setCredentials({
                refresh_token: connection.refreshToken,
            });
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            await this.prisma.emailConnection.update({
                where: { id: connectionId },
                data: {
                    accessToken: credentials.access_token,
                    expiresAt: credentials.expiry_date
                        ? new Date(credentials.expiry_date)
                        : null,
                },
            });
            return credentials.access_token;
        }
        catch (error) {
            console.error('Token refresh error:', error);
            await this.prisma.emailConnection.update({
                where: { id: connectionId },
                data: { isActive: false },
            });
            throw new common_1.BadRequestException('Failed to refresh token - please reconnect');
        }
    }
    async getValidAccessToken(connectionId) {
        const connection = await this.prisma.emailConnection.findUnique({
            where: { id: connectionId },
        });
        if (!connection) {
            throw new common_1.NotFoundException('Email connection not found');
        }
        const isExpired = connection.expiresAt &&
            new Date(connection.expiresAt).getTime() < Date.now() + 5 * 60 * 1000;
        if (isExpired && connection.refreshToken) {
            return this.refreshAccessToken(connectionId);
        }
        return connection.accessToken;
    }
    async updateConnection(connectionId, companyId, data) {
        const connection = await this.prisma.emailConnection.findFirst({
            where: { id: connectionId, companyId },
        });
        if (!connection) {
            throw new common_1.NotFoundException('Email connection not found');
        }
        const updated = await this.prisma.emailConnection.update({
            where: { id: connectionId },
            data: {
                autoImport: data.autoImport,
            },
            select: {
                id: true,
                provider: true,
                email: true,
                isActive: true,
                autoImport: true,
                lastSyncAt: true,
                createdAt: true,
            },
        });
        return updated;
    }
};
exports.IntegrationsService = IntegrationsService;
exports.IntegrationsService = IntegrationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], IntegrationsService);
//# sourceMappingURL=integrations.service.js.map