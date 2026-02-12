// Environment types for type safety
// 'test' is used for unit/e2e testing in CI
export type Environment = 'development' | 'production' | 'test';

// Validation helper for required environment variables
function requireEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Validate environment on startup
function validateEnvironment(): void {
  const env = process.env.NODE_ENV as Environment;
  const isProduction = env === 'production';

  // Critical validations for production
  if (isProduction) {
    const criticalVars = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];

    const missing = criticalVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(
        `Missing critical environment variables for ${env}: ${missing.join(', ')}`,
      );
    }

    // Warn about insecure defaults
    if (
      process.env.JWT_SECRET ===
      'your-super-secret-jwt-key-change-in-production'
    ) {
      throw new Error(
        'JWT_SECRET must be changed from default value in production',
      );
    }
  }
}

// Run validation
validateEnvironment();

export default () => ({
  // Environment
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: (process.env.NODE_ENV || 'development') as Environment,
  apiPrefix: process.env.API_PREFIX || 'api',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment:
    process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret:
      process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
    accessExpirationSeconds: parseInt(
      process.env.JWT_ACCESS_EXPIRATION_SECONDS || '900',
      10,
    ), // 15 minutes
    refreshExpirationSeconds: parseInt(
      process.env.JWT_REFRESH_EXPIRATION_SECONDS || '604800',
      10,
    ), // 7 days
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

  redis: (() => {
    // Support Railway's REDIS_URL format: redis://default:password@host:port
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const url = new URL(redisUrl);
        return {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
          password: url.password || undefined,
          url: redisUrl,
        };
      } catch {
        // Fall through to manual config
      }
    }
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      url: undefined,
    };
  })(),

  // AI Provider Configuration
  // Set AI_PROVIDER to 'groq' for development (cost-effective) or 'openai' for production
  ai: {
    provider: process.env.AI_PROVIDER || 'groq', // 'groq' (default for dev) or 'openai' (for prod)
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', // Fast and capable model
  },

  sendgrid: {
    apiKey:
      process.env.NODE_ENV === 'production'
        ? process.env.SENDGRID_API_KEY_PROD || process.env.SENDGRID_API_KEY
        : process.env.SENDGRID_API_KEY,
    fromEmail:
      process.env.NODE_ENV === 'production'
        ? process.env.SENDGRID_FROM_EMAIL_PROD ||
          process.env.SENDGRID_FROM_EMAIL ||
          'noreply@recdesk.io'
        : process.env.SENDGRID_FROM_EMAIL || 'noreply@recdesk.io',
  },

  // Google (for Gmail email integration)
  google: {
    clientId:
      process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_CLIENT_ID_PROD || process.env.GOOGLE_CLIENT_ID
        : process.env.GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_CLIENT_SECRET_PROD ||
          process.env.GOOGLE_CLIENT_SECRET
        : process.env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_REDIRECT_URI_PROD ||
          'https://api.recdesk.io/api/integrations/gmail/callback'
        : process.env.GOOGLE_REDIRECT_URI ||
          'http://localhost:3000/api/integrations/gmail/callback',
    // Gmail Pub/Sub push notifications (dual dev/prod)
    pubsubTopic:
      process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_PUBSUB_TOPIC_PROD ||
          process.env.GOOGLE_PUBSUB_TOPIC
        : process.env.GOOGLE_PUBSUB_TOPIC,
    pubsubVerificationToken:
      process.env.NODE_ENV === 'production'
        ? process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN_PROD ||
          process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN
        : process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN,
  },

  // Google OAuth (for user authentication)
  googleAuth: {
    clientId:
      process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_AUTH_CLIENT_ID_PROD
        : process.env.GOOGLE_AUTH_CLIENT_ID,
    clientSecret:
      process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_AUTH_CLIENT_SECRET_PROD
        : process.env.GOOGLE_AUTH_CLIENT_SECRET,
    redirectUri:
      process.env.NODE_ENV === 'production'
        ? process.env.GOOGLE_AUTH_REDIRECT_URI_PROD ||
          'https://api.recdesk.io/api/auth/google/callback'
        : process.env.GOOGLE_AUTH_REDIRECT_URI ||
          'http://localhost:3000/api/auth/google/callback',
  },

  // Microsoft OAuth (for user authentication)
  microsoft: {
    clientId:
      process.env.NODE_ENV === 'production'
        ? process.env.MICROSOFT_CLIENT_ID_PROD
        : process.env.MICROSOFT_CLIENT_ID,
    clientSecret:
      process.env.NODE_ENV === 'production'
        ? process.env.MICROSOFT_CLIENT_SECRET_PROD
        : process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri:
      process.env.NODE_ENV === 'production'
        ? process.env.MICROSOFT_REDIRECT_URI_PROD ||
          'https://api.recdesk.io/api/auth/microsoft/callback'
        : process.env.MICROSOFT_REDIRECT_URI ||
          'http://localhost:3000/api/auth/microsoft/callback',
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

  // Email Prefilter Configuration
  // Reduces AI API costs by 50-80% by skipping obvious non-job-application emails
  prefilter: {
    enabled: process.env.PREFILTER_ENABLED !== 'false', // Default: true
    autoClassifyEnabled:
      process.env.PREFILTER_AUTO_CLASSIFY_ENABLED !== 'false', // Default: true
  },
});
