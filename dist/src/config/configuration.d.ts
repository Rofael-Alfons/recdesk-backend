declare const _default: () => {
    port: number;
    nodeEnv: string;
    apiPrefix: string;
    database: {
        url: string | undefined;
    };
    jwt: {
        secret: string;
        accessExpirationSeconds: number;
        refreshExpirationSeconds: number;
    };
    bcrypt: {
        saltRounds: number;
    };
    aws: {
        region: string;
        accessKeyId: string | undefined;
        secretAccessKey: string | undefined;
        s3Bucket: string | undefined;
    };
    redis: {
        host: string;
        port: number;
        password: string | undefined;
    };
    ai: {
        provider: string;
    };
    openai: {
        apiKey: string | undefined;
    };
    groq: {
        apiKey: string | undefined;
        model: string;
    };
    sendgrid: {
        apiKey: string | undefined;
        fromEmail: string | undefined;
    };
    google: {
        clientId: string | undefined;
        clientSecret: string | undefined;
        redirectUri: string;
    };
    frontend: {
        url: string;
    };
    encryption: {
        key: string | undefined;
    };
    stripe: {
        secretKey: string | undefined;
        webhookSecret: string | undefined;
        starterPriceId: string | undefined;
        professionalPriceId: string | undefined;
        enterprisePriceId: string | undefined;
    };
    prefilter: {
        enabled: boolean;
        autoClassifyEnabled: boolean;
    };
};
export default _default;
