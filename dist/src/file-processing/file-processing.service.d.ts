export interface TextExtractionResult {
    text: string;
    confidence: number;
    pageCount?: number;
    error?: string;
}
export declare class FileProcessingService {
    private readonly supportedExtensions;
    private readonly maxFileSize;
    extractText(fileBuffer: Buffer, fileName: string): Promise<TextExtractionResult>;
    private extractFromPdf;
    private extractFromDocx;
    private calculateConfidence;
    validateFile(file: Express.Multer.File): {
        valid: boolean;
        error?: string;
    };
    getSupportedExtensions(): string[];
    extractTextFromFile(filePath: string): Promise<TextExtractionResult>;
}
