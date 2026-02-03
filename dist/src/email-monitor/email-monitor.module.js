"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailMonitorModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const email_monitor_service_1 = require("./email-monitor.service");
const email_monitor_scheduler_1 = require("./email-monitor.scheduler");
const email_monitor_controller_1 = require("./email-monitor.controller");
const email_prefilter_service_1 = require("./email-prefilter.service");
const email_cleanup_service_1 = require("./email-cleanup.service");
const prisma_module_1 = require("../prisma/prisma.module");
const integrations_module_1 = require("../integrations/integrations.module");
const ai_module_1 = require("../ai/ai.module");
const file_processing_module_1 = require("../file-processing/file-processing.module");
const billing_module_1 = require("../billing/billing.module");
let EmailMonitorModule = class EmailMonitorModule {
};
exports.EmailMonitorModule = EmailMonitorModule;
exports.EmailMonitorModule = EmailMonitorModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            integrations_module_1.IntegrationsModule,
            ai_module_1.AiModule,
            file_processing_module_1.FileProcessingModule,
            billing_module_1.BillingModule,
        ],
        controllers: [email_monitor_controller_1.EmailMonitorController],
        providers: [
            email_monitor_service_1.EmailMonitorService,
            email_monitor_scheduler_1.EmailMonitorScheduler,
            email_prefilter_service_1.EmailPrefilterService,
            email_cleanup_service_1.EmailCleanupService,
        ],
        exports: [email_monitor_service_1.EmailMonitorService, email_prefilter_service_1.EmailPrefilterService],
    })
], EmailMonitorModule);
//# sourceMappingURL=email-monitor.module.js.map