"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
let StorageService = StorageService_1 = class StorageService {
    configService;
    logger = new common_1.Logger(StorageService_1.name);
    s3Client = null;
    bucket;
    region;
    useLocalFallback;
    localUploadPath;
    constructor(configService) {
        this.configService = configService;
        this.region =
            this.configService.get('aws.region') || 'eu-central-1';
        this.bucket =
            this.configService.get('aws.s3Bucket') || 'recdesk-cvs';
        this.useLocalFallback =
            this.configService.get('S3_USE_LOCAL_FALLBACK') === 'true' ||
                !this.configService.get('aws.accessKeyId');
        this.localUploadPath = path.join(process.cwd(), 'uploads', 'cvs');
    }
    async onModuleInit() {
        if (this.useLocalFallback) {
            this.logger.warn('S3 credentials not configured or local fallback enabled. Using local file storage.');
            await this.ensureLocalDirectory();
        }
        else {
            this.initializeS3Client();
            await this.verifyBucketAccess();
        }
    }
    initializeS3Client() {
        const accessKeyId = this.configService.get('aws.accessKeyId');
        const secretAccessKey = this.configService.get('aws.secretAccessKey');
        if (!accessKeyId || !secretAccessKey) {
            this.logger.warn('AWS credentials not configured. Falling back to local storage.');
            this.useLocalFallback = true;
            return;
        }
        this.s3Client = new client_s3_1.S3Client({
            region: this.region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
        this.logger.log(`S3 client initialized for region: ${this.region}, bucket: ${this.bucket}`);
    }
    async verifyBucketAccess() {
        if (!this.s3Client)
            return;
        try {
            await this.s3Client.send(new client_s3_1.HeadBucketCommand({ Bucket: this.bucket }));
            this.logger.log(`Successfully connected to S3 bucket: ${this.bucket}`);
        }
        catch (error) {
            this.logger.error(`Failed to access S3 bucket: ${this.bucket}`, error);
            this.logger.warn('Falling back to local storage due to S3 access error.');
            this.useLocalFallback = true;
        }
    }
    async ensureLocalDirectory() {
        try {
            await fs.mkdir(this.localUploadPath, { recursive: true });
            this.logger.log(`Local upload directory ensured: ${this.localUploadPath}`);
        }
        catch (error) {
            this.logger.error('Failed to create local upload directory', error);
        }
    }
    async uploadFile(buffer, originalFilename, contentType, companyId, folder = 'cvs') {
        const extension = path.extname(originalFilename).toLowerCase() || '.pdf';
        const key = `${companyId}/${folder}/${(0, uuid_1.v4)()}${extension}`;
        if (this.useLocalFallback) {
            return this.uploadFileLocally(buffer, key);
        }
        return this.uploadFileToS3(buffer, key, contentType);
    }
    async uploadFileToS3(buffer, key, contentType) {
        if (!this.s3Client) {
            throw new Error('S3 client not initialized');
        }
        try {
            await this.s3Client.send(new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            }));
            this.logger.debug(`File uploaded to S3: ${key}`);
            return {
                key,
                url: `s3://${this.bucket}/${key}`,
                isLocal: false,
            };
        }
        catch (error) {
            this.logger.error(`Failed to upload file to S3: ${key}`, error);
            throw error;
        }
    }
    async uploadFileLocally(buffer, key) {
        const filePath = path.join(process.cwd(), 'uploads', key);
        const directory = path.dirname(filePath);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(filePath, buffer);
        this.logger.debug(`File saved locally: ${filePath}`);
        return {
            key,
            url: `/uploads/${key}`,
            isLocal: true,
        };
    }
    async getSignedUrl(key, expiresIn = 3600) {
        if (key.startsWith('/uploads/') || this.useLocalFallback) {
            const localPath = key.startsWith('/uploads/') ? key : `/uploads/${key}`;
            return localPath;
        }
        if (key.startsWith('s3://')) {
            key = key.replace(`s3://${this.bucket}/`, '');
        }
        if (!this.s3Client) {
            this.logger.warn('S3 client not available, returning key as URL');
            return `/uploads/${key}`;
        }
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, command, {
                expiresIn,
            });
            return signedUrl;
        }
        catch (error) {
            this.logger.error(`Failed to generate signed URL for: ${key}`, error);
            throw error;
        }
    }
    async downloadFile(key) {
        if (key.startsWith('/uploads/')) {
            const filePath = path.join(process.cwd(), key);
            return fs.readFile(filePath);
        }
        if (key.startsWith('s3://')) {
            key = key.replace(`s3://${this.bucket}/`, '');
        }
        if (this.useLocalFallback || !this.s3Client) {
            const filePath = path.join(process.cwd(), 'uploads', key);
            return fs.readFile(filePath);
        }
        try {
            const response = await this.s3Client.send(new client_s3_1.GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }));
            const stream = response.Body;
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
        }
        catch (error) {
            this.logger.error(`Failed to download file from S3: ${key}`, error);
            throw error;
        }
    }
    async deleteFile(key) {
        if (key.startsWith('/uploads/')) {
            const filePath = path.join(process.cwd(), key);
            try {
                await fs.unlink(filePath);
                this.logger.debug(`Local file deleted: ${filePath}`);
            }
            catch (error) {
                this.logger.warn(`Failed to delete local file: ${filePath}`, error);
            }
            return;
        }
        if (key.startsWith('s3://')) {
            key = key.replace(`s3://${this.bucket}/`, '');
        }
        if (this.useLocalFallback || !this.s3Client) {
            const filePath = path.join(process.cwd(), 'uploads', key);
            try {
                await fs.unlink(filePath);
                this.logger.debug(`Local file deleted: ${filePath}`);
            }
            catch (error) {
                this.logger.warn(`Failed to delete local file: ${filePath}`, error);
            }
            return;
        }
        try {
            await this.s3Client.send(new client_s3_1.DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }));
            this.logger.debug(`File deleted from S3: ${key}`);
        }
        catch (error) {
            this.logger.error(`Failed to delete file from S3: ${key}`, error);
            throw error;
        }
    }
    isUsingLocalStorage() {
        return this.useLocalFallback;
    }
    isLocalPath(key) {
        return key.startsWith('/uploads/');
    }
    extractKey(storedValue) {
        if (storedValue.startsWith('s3://')) {
            return storedValue.replace(`s3://${this.bucket}/`, '');
        }
        if (storedValue.startsWith('/uploads/')) {
            return storedValue.replace('/uploads/', '');
        }
        return storedValue;
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StorageService);
//# sourceMappingURL=storage.service.js.map