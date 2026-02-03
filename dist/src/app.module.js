"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
const nestjs_pino_1 = require("nestjs-pino");
const correlation_id_middleware_1 = require("./common/middleware/correlation-id.middleware");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const companies_module_1 = require("./companies/companies.module");
const users_module_1 = require("./users/users.module");
const jobs_module_1 = require("./jobs/jobs.module");
const candidates_module_1 = require("./candidates/candidates.module");
const integrations_module_1 = require("./integrations/integrations.module");
const ai_module_1 = require("./ai/ai.module");
const file_processing_module_1 = require("./file-processing/file-processing.module");
const upload_module_1 = require("./upload/upload.module");
const queue_module_1 = require("./queue/queue.module");
const email_monitor_module_1 = require("./email-monitor/email-monitor.module");
const billing_module_1 = require("./billing/billing.module");
const email_templates_module_1 = require("./email-templates/email-templates.module");
const email_sending_module_1 = require("./email-sending/email-sending.module");
const notifications_module_1 = require("./notifications/notifications.module");
const health_module_1 = require("./health/health.module");
const cache_module_1 = require("./cache/cache.module");
const storage_module_1 = require("./storage/storage.module");
const jwt_auth_guard_1 = require("./common/guards/jwt-auth.guard");
const roles_guard_1 = require("./common/guards/roles.guard");
const configuration_1 = __importDefault(require("./config/configuration"));
const isRedisConfigured = () => {
    return !!process.env.REDIS_HOST || process.env.NODE_ENV === 'production';
};
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(correlation_id_middleware_1.CorrelationIdMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
            }),
            throttler_1.ThrottlerModule.forRoot({
                throttlers: [
                    { name: 'short', ttl: 1000, limit: 20 },
                    { name: 'medium', ttl: 10000, limit: 100 },
                    { name: 'long', ttl: 60000, limit: 300 },
                ],
            }),
            nestjs_pino_1.LoggerModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (configService) => {
                    const isProduction = configService.get('nodeEnv') === 'production';
                    return {
                        pinoHttp: {
                            level: isProduction ? 'info' : 'debug',
                            transport: isProduction
                                ? undefined
                                : {
                                    target: 'pino-pretty',
                                    options: {
                                        singleLine: true,
                                        colorize: true,
                                    },
                                },
                            autoLogging: {
                                ignore: (req) => {
                                    return req.url?.startsWith('/health') || false;
                                },
                            },
                            customProps: (req) => ({
                                context: 'HTTP',
                                correlationId: req.headers['x-correlation-id'] || req.correlationId,
                            }),
                            redact: ['req.headers.authorization'],
                        },
                    };
                },
                inject: [config_1.ConfigService],
            }),
            prisma_module_1.PrismaModule,
            cache_module_1.CacheModule,
            storage_module_1.StorageModule,
            health_module_1.HealthModule,
            auth_module_1.AuthModule,
            companies_module_1.CompaniesModule,
            users_module_1.UsersModule,
            jobs_module_1.JobsModule,
            candidates_module_1.CandidatesModule,
            integrations_module_1.IntegrationsModule,
            ai_module_1.AiModule,
            file_processing_module_1.FileProcessingModule,
            upload_module_1.UploadModule,
            email_monitor_module_1.EmailMonitorModule,
            billing_module_1.BillingModule,
            email_templates_module_1.EmailTemplatesModule,
            email_sending_module_1.EmailSendingModule,
            notifications_module_1.NotificationsModule,
            ...(isRedisConfigured() ? [queue_module_1.QueueModule] : []),
        ],
        providers: [
            {
                provide: core_1.APP_FILTER,
                useClass: all_exceptions_filter_1.AllExceptionsFilter,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: roles_guard_1.RolesGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map