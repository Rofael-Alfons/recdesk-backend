"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const nestjs_pino_1 = require("nestjs-pino");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        rawBody: true,
        bufferLogs: true,
    });
    const logger = app.get(nestjs_pino_1.Logger);
    app.useLogger(logger);
    app.useGlobalInterceptors(new nestjs_pino_1.LoggerErrorInterceptor());
    const configService = app.get(config_1.ConfigService);
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        frameguard: { action: 'deny' },
        hidePoweredBy: true,
        noSniff: true,
        xssFilter: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginResourcePolicy: { policy: 'same-origin' },
    }));
    const apiPrefix = configService.get('apiPrefix') || 'api';
    app.setGlobalPrefix(apiPrefix, {
        exclude: ['health', 'health/live', 'health/ready'],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    const frontendUrl = configService.get('frontend.url');
    const allowedOrigins = frontendUrl
        ? frontendUrl.split(',').map((url) => url.trim())
        : ['http://localhost:3001'];
    app.enableCors({
        origin: allowedOrigins,
        credentials: true,
    });
    const nodeEnv = configService.get('nodeEnv');
    const isProduction = nodeEnv === 'production';
    if (!isProduction) {
        const config = new swagger_1.DocumentBuilder()
            .setTitle('RecDesk AI API')
            .setDescription('API documentation for RecDesk AI - Hiring Intelligence Platform')
            .setVersion('1.0')
            .addBearerAuth()
            .addTag('Authentication', 'User authentication endpoints')
            .addTag('Users', 'User management endpoints')
            .addTag('Companies', 'Company management endpoints')
            .addTag('Jobs', 'Job posting endpoints')
            .addTag('Candidates', 'Candidate management endpoints')
            .addTag('Email Integration', 'Email integration endpoints')
            .addTag('Billing', 'Billing and subscription endpoints')
            .addTag('Webhooks', 'Webhook endpoints for external services')
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        swagger_1.SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    }
    const jwtSecret = configService.get('jwt.secret');
    if (isProduction) {
        if (!jwtSecret || jwtSecret === 'your-super-secret-key-change-in-production') {
            logger.error('FATAL: JWT_SECRET must be set to a strong secret in production!');
            process.exit(1);
        }
    }
    const port = configService.get('port') || 3000;
    await app.listen(port);
    logger.log(`RecDesk AI Backend running on: http://localhost:${port}`);
    if (!isProduction) {
        logger.log(`API Documentation: http://localhost:${port}/${apiPrefix}/docs`);
    }
    logger.log(`Health Check: http://localhost:${port}/health`);
}
bootstrap();
//# sourceMappingURL=main.js.map