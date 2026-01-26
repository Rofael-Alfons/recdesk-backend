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
var EmailCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailCleanupService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
let EmailCleanupService = EmailCleanupService_1 = class EmailCleanupService {
    prisma;
    logger = new common_1.Logger(EmailCleanupService_1.name);
    retentionDays = 30;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async cleanupOldSkippedEmails() {
        this.logger.log('Starting cleanup of old skipped email records...');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
        try {
            const result = await this.prisma.emailImport.deleteMany({
                where: {
                    status: 'SKIPPED',
                    createdAt: { lt: cutoffDate },
                },
            });
            this.logger.log(`Cleaned up ${result.count} old skipped email records (older than ${this.retentionDays} days)`);
        }
        catch (error) {
            this.logger.error('Failed to cleanup old skipped emails:', error);
        }
    }
};
exports.EmailCleanupService = EmailCleanupService;
__decorate([
    (0, schedule_1.Cron)('0 3 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EmailCleanupService.prototype, "cleanupOldSkippedEmails", null);
exports.EmailCleanupService = EmailCleanupService = EmailCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EmailCleanupService);
//# sourceMappingURL=email-cleanup.service.js.map