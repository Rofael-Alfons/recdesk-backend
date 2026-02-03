import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface UploadResult {
    key: string;
    url: string;
    isLocal: boolean;
}
export declare class StorageService implements OnModuleInit {
    private configService;
    private readonly logger;
    private s3Client;
    private bucket;
    private region;
    private useLocalFallback;
    private localUploadPath;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    private initializeS3Client;
    private verifyBucketAccess;
    private ensureLocalDirectory;
    uploadFile(buffer: Buffer, originalFilename: string, contentType: string, companyId: string, folder?: string): Promise<UploadResult>;
    private uploadFileToS3;
    private uploadFileLocally;
    getSignedUrl(key: string, expiresIn?: number): Promise<string>;
    downloadFile(key: string): Promise<Buffer>;
    deleteFile(key: string): Promise<void>;
    isUsingLocalStorage(): boolean;
    isLocalPath(key: string): boolean;
    extractKey(storedValue: string): string;
}
