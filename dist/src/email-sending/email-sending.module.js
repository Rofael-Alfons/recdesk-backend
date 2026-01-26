"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailSendingModule = void 0;
const common_1 = require("@nestjs/common");
const email_sending_controller_1 = require("./email-sending.controller");
const email_sending_service_1 = require("./email-sending.service");
const template_engine_service_1 = require("./template-engine.service");
const email_templates_module_1 = require("../email-templates/email-templates.module");
const billing_module_1 = require("../billing/billing.module");
let EmailSendingModule = class EmailSendingModule {
};
exports.EmailSendingModule = EmailSendingModule;
exports.EmailSendingModule = EmailSendingModule = __decorate([
    (0, common_1.Module)({
        imports: [email_templates_module_1.EmailTemplatesModule, billing_module_1.BillingModule],
        controllers: [email_sending_controller_1.EmailSendingController],
        providers: [email_sending_service_1.EmailSendingService, template_engine_service_1.TemplateEngineService],
        exports: [email_sending_service_1.EmailSendingService, template_engine_service_1.TemplateEngineService],
    })
], EmailSendingModule);
//# sourceMappingURL=email-sending.module.js.map