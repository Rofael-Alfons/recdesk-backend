import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for Stripe webhook signature verification
    bufferLogs: true, // Buffer logs until Pino logger is attached
  });

  // Use Pino logger for structured logging
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  const configService = app.get(ConfigService);

  // Block malicious path probes (scanners looking for .env, secrets, etc.)
  // Applied early to reject before any NestJS processing
  app.use((req: Request, res: Response, next: NextFunction) => {
    const url = req.url.toLowerCase();
    if (
      url.includes('.env') ||
      url.includes('secrets.yml') ||
      url.includes('config.json') ||
      url.includes('.git/') ||
      url.includes('wp-admin') ||
      url.includes('wp-login') ||
      url.includes('phpmy') ||
      url.includes('.php')
    ) {
      res.status(403).end();
      return;
    }
    next();
  });

  // Security headers with Helmet
  app.use(
    helmet({
      // Content Security Policy - restrict resource loading
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
      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      // Prevent clickjacking
      frameguard: { action: 'deny' },
      // Disable X-Powered-By header
      hidePoweredBy: true,
      // Prevent MIME type sniffing
      noSniff: true,
      // XSS protection
      xssFilter: true,
      // Referrer policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Cross-Origin policies (may need adjustment for your API)
      crossOriginEmbedderPolicy: false, // Disabled for API compatibility
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  // Global exception filter is registered via APP_FILTER in AppModule

  // Global prefix
  const apiPrefix = configService.get<string>('apiPrefix') || 'api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'health/live', 'health/ready'], // Health checks accessible without prefix
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS - support multiple origins for staging/production
  const frontendUrl = configService.get<string>('frontend.url');
  const allowedOrigins = frontendUrl
    ? frontendUrl.split(',').map((url) => url.trim())
    : ['http://localhost:3001'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Get environment
  const nodeEnv = configService.get<string>('nodeEnv');
  const isProduction = nodeEnv === 'production';

  // Swagger documentation - only enabled in non-production
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('RecDesk AI API')
      .setDescription(
        'API documentation for RecDesk AI - Hiring Intelligence Platform',
      )
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

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  // Validate critical configuration in production
  const jwtSecret = configService.get<string>('jwt.secret');

  if (isProduction) {
    if (
      !jwtSecret ||
      jwtSecret === 'your-super-secret-key-change-in-production'
    ) {
      logger.error(
        'FATAL: JWT_SECRET must be set to a strong secret in production!',
      );
      process.exit(1);
    }
  }

  // Enable graceful shutdown hooks (SIGTERM/SIGINT cleanup)
  app.enableShutdownHooks();

  // Start server
  const port = configService.get<number>('port') || 3000;
  const server = await app.listen(port);

  // Set request/connection timeouts to prevent hanging connections
  server.setTimeout(60000); // 60s request timeout
  server.keepAliveTimeout = 65000; // slightly above load balancer timeout
  server.headersTimeout = 66000; // slightly above keepAliveTimeout

  logger.log(`RecDesk AI Backend running on: http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`API Documentation: http://localhost:${port}/${apiPrefix}/docs`);
  }
  logger.log(`Health Check: http://localhost:${port}/health`);
}

bootstrap();
