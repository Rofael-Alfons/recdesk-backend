import { StorageService } from '../storage/storage.service';
export interface TextExtractionResult {
    text: string;
    confidence: number;
    pageCount?: number;
    error?: string;
}
export declare class FileProcessingService {
    private storageService;
    private readonly logger;
    private readonly supportedExtensions;
    private readonly maxFileSize;
    constructor(storageService: StorageService);
    extractText(fileBuffer: Buffer, fileName: string): Promise<TextExtractionResult>;
    private extractFromPdf;
    private extractFromDocx;
    private calculateConfidence;
    validateFile(file: Express.Multer.File): {
        valid: boolean;
        error?: string;
    };
    getSupportedExtensions(): string[];
    extractTextFromFile(filePathOrKey: string): Promise<TextExtractionResult>;
}
