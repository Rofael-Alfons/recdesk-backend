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
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    prisma;
    logger = new common_1.Logger(NotificationsService_1.name);
    notificationSubject = new rxjs_1.Subject();
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createNotification(data) {
        const notification = await this.prisma.notification.create({
            data: {
                type: data.type,
                title: data.title,
                message: data.message,
                metadata: data.metadata || undefined,
                companyId: data.companyId,
                userId: data.userId,
            },
        });
        const notificationEvent = {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            metadata: notification.metadata,
            createdAt: notification.createdAt,
        };
        this.notificationSubject.next({
            companyId: data.companyId,
            notification: notificationEvent,
        });
        this.logger.log(`Created notification: ${notification.type} for company ${data.companyId}`);
        return notificationEvent;
    }
    subscribeToCompany(companyId) {
        return this.notificationSubject.pipe((0, rxjs_1.filter)((event) => event.companyId === companyId), (0, rxjs_1.map)((event) => event.notification));
    }
    async getNotifications(companyId, options = {}) {
        const { page = 1, limit = 20, unreadOnly = false } = options;
        const skip = (page - 1) * limit;
        const where = {
            companyId,
            ...(unreadOnly && { isRead: false }),
        };
        const [notifications, total] = await Promise.all([
            this.prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.notification.count({ where }),
        ]);
        return {
            data: notifications.map((n) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                metadata: n.metadata,
                createdAt: n.createdAt,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async markAsRead(notificationId, companyId) {
        await this.prisma.notification.updateMany({
            where: {
                id: notificationId,
                companyId,
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });
    }
    async markAllAsRead(companyId) {
        await this.prisma.notification.updateMany({
            where: {
                companyId,
                isRead: false,
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });
    }
    async getUnreadCount(companyId) {
        return this.prisma.notification.count({
            where: {
                companyId,
                isRead: false,
            },
        });
    }
    async checkAndNotifyUsageLimits(companyId) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
            include: { plan: true },
        });
        if (!subscription) {
            return;
        }
        const periodStart = subscription.currentPeriodStart;
        const periodEnd = subscription.currentPeriodEnd;
        const cvLimit = subscription.plan.cvLimit;
        if (cvLimit === -1) {
            return;
        }
        const usageRecords = await this.prisma.usageRecord.findMany({
            where: {
                companyId,
                type: 'CV_PROCESSED',
                periodStart: { gte: periodStart },
                periodEnd: { lte: periodEnd },
            },
        });
        const cvProcessed = usageRecords.reduce((sum, r) => sum + r.count, 0);
        const usagePercentage = Math.round((cvProcessed / cvLimit) * 100);
        let tracker = await this.prisma.usageAlertTracker.findUnique({
            where: {
                companyId_periodStart: {
                    companyId,
                    periodStart,
                },
            },
        });
        if (!tracker) {
            tracker = await this.prisma.usageAlertTracker.create({
                data: {
                    companyId,
                    periodStart,
                    periodEnd,
                },
            });
        }
        if (usagePercentage >= 100 && !tracker.threshold100Sent) {
            await this.createNotification({
                type: client_1.NotificationType.USAGE_LIMIT_REACHED,
                companyId,
                title: 'Usage Limit Reached',
                message: `You have reached your CV processing limit of ${cvLimit} CVs this month. Upgrade your plan to continue processing CVs.`,
                metadata: { cvProcessed, cvLimit, usagePercentage },
            });
            await this.prisma.usageAlertTracker.update({
                where: { id: tracker.id },
                data: { threshold100Sent: true },
            });
        }
        else if (usagePercentage >= 90 && !tracker.threshold90Sent) {
            await this.createNotification({
                type: client_1.NotificationType.USAGE_WARNING_90,
                companyId,
                title: 'Usage at 90%',
                message: `You have used ${cvProcessed} of ${cvLimit} CVs (${usagePercentage}%) this month. Consider upgrading your plan.`,
                metadata: { cvProcessed, cvLimit, usagePercentage },
            });
            await this.prisma.usageAlertTracker.update({
                where: { id: tracker.id },
                data: { threshold90Sent: true },
            });
        }
        else if (usagePercentage >= 80 && !tracker.threshold80Sent) {
            await this.createNotification({
                type: client_1.NotificationType.USAGE_WARNING_80,
                companyId,
                title: 'Usage at 80%',
                message: `You have used ${cvProcessed} of ${cvLimit} CVs (${usagePercentage}%) this month.`,
                metadata: { cvProcessed, cvLimit, usagePercentage },
            });
            await this.prisma.usageAlertTracker.update({
                where: { id: tracker.id },
                data: { threshold80Sent: true },
            });
        }
    }
    async notifyTrialExpiring(companyId, daysLeft) {
        const notificationType = daysLeft <= 1
            ? client_1.NotificationType.TRIAL_EXPIRING_TOMORROW
            : client_1.NotificationType.TRIAL_EXPIRING_SOON;
        const title = daysLeft <= 1
            ? 'Trial Expires Tomorrow!'
            : `Trial Expires in ${daysLeft} Days`;
        const message = daysLeft <= 1
            ? 'Your free trial expires tomorrow. Upgrade now to continue using RecDesk without interruption.'
            : `Your free trial expires in ${daysLeft} days. Upgrade to a paid plan to keep all your data and continue using RecDesk.`;
        await this.createNotification({
            type: notificationType,
            companyId,
            title,
            message,
            metadata: { daysLeft },
        });
        this.logger.log(`Sent trial expiring notification to company ${companyId} (${daysLeft} days left)`);
    }
    async notifyTrialExpired(companyId) {
        await this.createNotification({
            type: client_1.NotificationType.TRIAL_EXPIRED,
            companyId,
            title: 'Free Trial Expired',
            message: 'Your free trial has ended. Upgrade to a paid plan to continue using RecDesk and access your data.',
            metadata: { expiredAt: new Date().toISOString() },
        });
        this.logger.log(`Sent trial expired notification to company ${companyId}`);
    }
    async notifySubscriptionExpired(companyId) {
        await this.createNotification({
            type: client_1.NotificationType.SUBSCRIPTION_EXPIRED,
            companyId,
            title: 'Subscription Expired',
            message: 'Your subscription has expired. Please renew your subscription to continue using RecDesk.',
            metadata: { expiredAt: new Date().toISOString() },
        });
        this.logger.log(`Sent subscription expired notification to company ${companyId}`);
    }
    async notifyPaymentFailed(companyId, gracePeriodDays) {
        await this.createNotification({
            type: client_1.NotificationType.PAYMENT_FAILED_WARNING,
            companyId,
            title: 'Payment Failed',
            message: `We couldn't process your payment. Please update your payment method within ${gracePeriodDays} days to avoid service interruption.`,
            metadata: { gracePeriodDays, notifiedAt: new Date().toISOString() },
        });
        this.logger.log(`Sent payment failed notification to company ${companyId}`);
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map