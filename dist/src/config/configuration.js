"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    apiPrefix: process.env.API_PREFIX || 'api',
    database: {
        url: process.env.DATABASE_URL,
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
        accessExpirationSeconds: parseInt(process.env.JWT_ACCESS_EXPIRATION_SECONDS || '900', 10),
        refreshExpirationSeconds: parseInt(process.env.JWT_REFRESH_EXPIRATION_SECONDS || '604800', 10),
    },
    bcrypt: {
        saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    },
    aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        s3Bucket: process.env.AWS_S3_BUCKET,
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
    },
    ai: {
        provider: process.env.AI_PROVIDER || 'groq',
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
    },
    groq: {
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    },
    sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.SENDGRID_FROM_EMAIL,
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/gmail/callback',
    },
    frontend: {
        url: process.env.FRONTEND_URL || 'http://localhost:3001',
    },
    encryption: {
        key: process.env.ENCRYPTION_KEY,
    },
});
//# sourceMappingURL=configuration.js.map