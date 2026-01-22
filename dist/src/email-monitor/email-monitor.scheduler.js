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
var EmailMonitorScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailMonitorScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const email_monitor_service_1 = require("./email-monitor.service");
const prisma_service_1 = require("../prisma/prisma.service");
let EmailMonitorScheduler = EmailMonitorScheduler_1 = class EmailMonitorScheduler {
    emailMonitorService;
    prisma;
    logger = new common_1.Logger(EmailMonitorScheduler_1.name);
    isRunning = false;
    constructor(emailMonitorService, prisma) {
        this.emailMonitorService = emailMonitorService;
        this.prisma = prisma;
    }
    async handleEmailPolling() {
        if (this.isRunning) {
            this.logger.warn('Previous polling job still running, skipping...');
            return;
        }
        this.isRunning = true;
        this.logger.log('Starting scheduled email polling...');
        try {
            const connections = await this.prisma.emailConnection.findMany({
                where: {
                    isActive: true,
                    autoImport: true,
                },
                include: {
                    company: true,
                },
            });
            this.logger.log(`Found ${connections.length} active email connections to poll`);
            for (const connection of connections) {
                try {
                    await this.emailMonitorService.pollEmailsForConnection(connection.id);
                }
                catch (error) {
                    this.logger.error(`Failed to poll emails for connection ${connection.id} (${connection.email}):`, error);
                }
            }
            this.logger.log('Completed scheduled email polling');
        }
        catch (error) {
            this.logger.error('Failed during email polling job:', error);
        }
        finally {
            this.isRunning = false;
        }
    }
    async handleTokenRefresh() {
        this.logger.log('Checking for tokens that need refresh...');
        try {
            const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
            const expiringConnections = await this.prisma.emailConnection.findMany({
                where: {
                    isActive: true,
                    expiresAt: {
                        lte: oneHourFromNow,
                    },
                    refreshToken: {
                        not: null,
                    },
                },
            });
            this.logger.log(`Found ${expiringConnections.length} connections needing token refresh`);
            for (const connection of expiringConnections) {
                try {
                    await this.emailMonitorService.refreshConnectionToken(connection.id);
                    this.logger.log(`Refreshed token for connection ${connection.id}`);
                }
                catch (error) {
                    this.logger.error(`Failed to refresh token for connection ${connection.id}:`, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Failed during token refresh job:', error);
        }
    }
};
exports.EmailMonitorScheduler = EmailMonitorScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EmailMonitorScheduler.prototype, "handleEmailPolling", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_30_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EmailMonitorScheduler.prototype, "handleTokenRefresh", null);
exports.EmailMonitorScheduler = EmailMonitorScheduler = EmailMonitorScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_monitor_service_1.EmailMonitorService,
        prisma_service_1.PrismaService])
], EmailMonitorScheduler);
//# sourceMappingURL=email-monitor.scheduler.js.map