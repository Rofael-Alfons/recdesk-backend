"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const apiPrefix = configService.get('apiPrefix') || 'api';
    app.setGlobalPrefix(apiPrefix);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    const frontendUrl = configService.get('frontendUrl');
    app.enableCors({
        origin: frontendUrl || 'http://localhost:3001',
        credentials: true,
    });
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
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    const port = configService.get('port') || 3000;
    await app.listen(port);
    console.log(`🚀 RecDesk AI Backend running on: http://localhost:${port}`);
    console.log(`📚 API Documentation: http://localhost:${port}/${apiPrefix}/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map