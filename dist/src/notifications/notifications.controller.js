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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const swagger_1 = require("@nestjs/swagger");
const notifications_service_1 = require("./notifications.service");
const dto_1 = require("./dto");
let NotificationsController = class NotificationsController {
    notificationsService;
    constructor(notificationsService) {
        this.notificationsService = notificationsService;
    }
    subscribeToNotifications(req) {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return new rxjs_1.Observable((subscriber) => {
                subscriber.error(new Error('Unauthorized'));
            });
        }
        const heartbeat$ = (0, rxjs_1.interval)(30000).pipe((0, rxjs_1.startWith)(0), (0, rxjs_1.map)(() => ({ type: 'heartbeat', data: { timestamp: new Date().toISOString() } })));
        const notifications$ = this.notificationsService.subscribeToCompany(companyId).pipe((0, rxjs_1.map)((notification) => ({ type: 'notification', data: notification })));
        return new rxjs_1.Observable((subscriber) => {
            const heartbeatSub = heartbeat$.subscribe({
                next: (event) => {
                    subscriber.next({
                        data: JSON.stringify(event),
                    });
                },
            });
            const notificationSub = notifications$.subscribe({
                next: (event) => {
                    subscriber.next({
                        data: JSON.stringify(event),
                    });
                },
            });
            return () => {
                heartbeatSub.unsubscribe();
                notificationSub.unsubscribe();
            };
        });
    }
    async getNotifications(req, query) {
        const companyId = req.user?.companyId;
        return this.notificationsService.getNotifications(companyId, {
            page: query.page,
            limit: query.limit,
            unreadOnly: query.unreadOnly,
        });
    }
    async getUnreadCount(req) {
        const companyId = req.user?.companyId;
        const count = await this.notificationsService.getUnreadCount(companyId);
        return { count };
    }
    async markAsRead(req, id) {
        const companyId = req.user?.companyId;
        await this.notificationsService.markAsRead(id, companyId);
        return { success: true };
    }
    async markAllAsRead(req) {
        const companyId = req.user?.companyId;
        await this.notificationsService.markAllAsRead(companyId);
        return { success: true };
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)('stream'),
    (0, common_1.Sse)(),
    (0, swagger_1.ApiOperation)({ summary: 'Subscribe to real-time notifications via SSE' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", rxjs_1.Observable)
], NotificationsController.prototype, "subscribeToNotifications", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get notification history (paginated)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.NotificationQueryDto]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    (0, swagger_1.ApiOperation)({ summary: 'Get unread notification count' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getUnreadCount", null);
__decorate([
    (0, common_1.Patch)(':id/read'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a notification as read' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAsRead", null);
__decorate([
    (0, common_1.Patch)('read-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark all notifications as read' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAllAsRead", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('notifications'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map