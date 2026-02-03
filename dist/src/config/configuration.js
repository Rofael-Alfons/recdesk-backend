"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function requireEnv(name, defaultValue) {
    const value = process.env[name] || defaultValue;
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function validateEnvironment() {
    const env = process.env.NODE_ENV;
    const isProduction = env === 'production';
    if (isProduction) {
        const criticalVars = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];
        const missing = criticalVars.filter((v) => !process.env[v]);
        if (missing.length > 0) {
            throw new Error(`Missing critical environment variables for ${env}: ${missing.join(', ')}`);
        }
        if (process.env.JWT_SECRET ===
            'your-super-secret-jwt-key-change-in-production') {
            throw new Error('JWT_SECRET must be changed from default value in production');
        }
    }
}
validateEnvironment();
exports.default = () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: (process.env.NODE_ENV || 'development'),
    apiPrefix: process.env.API_PREFIX || 'api',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,
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
        region: process.env.AWS_REGION || 'eu-central-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        s3Bucket: process.env.AWS_S3_BUCKET || 'recdesk-cvs-dev',
        useLocalFallback: process.env.S3_USE_LOCAL_FALLBACK === 'true',
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
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@recdesk.io',
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI ||
            'http://localhost:3000/api/integrations/gmail/callback',
        pubsubTopic: process.env.GOOGLE_PUBSUB_TOPIC,
    },
    frontend: {
        url: process.env.FRONTEND_URL || 'http://localhost:3001',
    },
    encryption: {
        key: process.env.ENCRYPTION_KEY,
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        freeTrialPriceId: process.env.STRIPE_FREE_TRIAL_PRICE_ID,
        starterPriceId: process.env.STRIPE_STARTER_PRICE_ID,
        professionalPriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
        enterprisePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    },
    prefilter: {
        enabled: process.env.PREFILTER_ENABLED !== 'false',
        autoClassifyEnabled: process.env.PREFILTER_AUTO_CLASSIFY_ENABLED !== 'false',
    },
});
//# sourceMappingURL=configuration.js.map