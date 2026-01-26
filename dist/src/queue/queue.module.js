"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const config_1 = require("@nestjs/config");
const cv_processing_processor_1 = require("./processors/cv-processing.processor");
const email_classification_processor_1 = require("./processors/email-classification.processor");
const scoring_processor_1 = require("./processors/scoring.processor");
const queue_service_1 = require("./queue.service");
const prisma_module_1 = require("../prisma/prisma.module");
const ai_module_1 = require("../ai/ai.module");
const file_processing_module_1 = require("../file-processing/file-processing.module");
const billing_module_1 = require("../billing/billing.module");
const queue_constants_1 = require("./queue.constants");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (configService) => ({
                    redis: {
                        host: configService.get('redis.host'),
                        port: configService.get('redis.port'),
                        password: configService.get('redis.password') || undefined,
                    },
                    defaultJobOptions: {
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 2000,
                        },
                        removeOnComplete: 100,
                        removeOnFail: 50,
                    },
                }),
                inject: [config_1.ConfigService],
            }),
            bull_1.BullModule.registerQueue({ name: queue_constants_1.QUEUE_NAMES.CV_PROCESSING }, { name: queue_constants_1.QUEUE_NAMES.EMAIL_CLASSIFICATION }, { name: queue_constants_1.QUEUE_NAMES.SCORING }),
            prisma_module_1.PrismaModule,
            ai_module_1.AiModule,
            file_processing_module_1.FileProcessingModule,
            billing_module_1.BillingModule,
        ],
        providers: [
            queue_service_1.QueueService,
            cv_processing_processor_1.CvProcessingProcessor,
            email_classification_processor_1.EmailClassificationProcessor,
            scoring_processor_1.ScoringProcessor,
        ],
        exports: [queue_service_1.QueueService, bull_1.BullModule],
    })
], QueueModule);
//# sourceMappingURL=queue.module.js.map