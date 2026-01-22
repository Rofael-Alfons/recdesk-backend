import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { AiService } from '../ai/ai.service';
export interface UploadResult {
    fileName: string;
    status: 'success' | 'failed' | 'processing';
    candidateId?: string;
    error?: string;
}
export interface BulkUploadResult {
    totalFiles: number;
    successful: number;
    failed: number;
    results: UploadResult[];
}
export declare class UploadService {
    private prisma;
    private fileProcessingService;
    private aiService;
    private configService;
    private uploadDir;
    constructor(prisma: PrismaService, fileProcessingService: FileProcessingService, aiService: AiService, configService: ConfigService);
    private ensureUploadDir;
    uploadBulkCVs(files: Express.Multer.File[], companyId: string, jobId?: string): Promise<BulkUploadResult>;
    private processFile;
    private scoreCandidate;
    private extractNameFromFilename;
    private extractBasicDataFromFilename;
}
