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
    openai: {
        apiKey: string | undefined;
    };
    sendgrid: {
        apiKey: string | undefined;
        fromEmail: string | undefined;
    };
    google: {
        clientId: string | undefined;
        clientSecret: string | undefined;
        callbackUrl: string | undefined;
    };
    frontendUrl: string;
    encryption: {
        key: string | undefined;
    };
};
export default _default;
