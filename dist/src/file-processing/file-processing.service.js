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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var FileProcessingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileProcessingService = void 0;
const common_1 = require("@nestjs/common");
const pdf_parse_1 = require("pdf-parse");
const mammoth_1 = __importDefault(require("mammoth"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const storage_service_1 = require("../storage/storage.service");
let FileProcessingService = FileProcessingService_1 = class FileProcessingService {
    storageService;
    logger = new common_1.Logger(FileProcessingService_1.name);
    supportedExtensions = ['.pdf', '.docx', '.doc'];
    maxFileSize = 10 * 1024 * 1024;
    constructor(storageService) {
        this.storageService = storageService;
    }
    async extractText(fileBuffer, fileName) {
        const ext = path.extname(fileName).toLowerCase();
        if (!this.supportedExtensions.includes(ext)) {
            throw new common_1.BadRequestException(`Unsupported file type: ${ext}. Supported types: ${this.supportedExtensions.join(', ')}`);
        }
        if (fileBuffer.length > this.maxFileSize) {
            throw new common_1.BadRequestException('File size exceeds 10MB limit');
        }
        try {
            switch (ext) {
                case '.pdf':
                    return this.extractFromPdf(fileBuffer);
                case '.docx':
                case '.doc':
                    return this.extractFromDocx(fileBuffer);
                default:
                    throw new common_1.BadRequestException(`Unsupported file type: ${ext}`);
            }
        }
        catch (error) {
            console.error(`Text extraction error for ${fileName}:`, error);
            return {
                text: '',
                confidence: 0,
                error: error instanceof Error ? error.message : 'Unknown extraction error',
            };
        }
    }
    async extractFromPdf(fileBuffer) {
        let pdfParser = null;
        try {
            pdfParser = new pdf_parse_1.PDFParse({ data: fileBuffer });
            const textResult = await pdfParser.getText();
            const text = textResult.text.trim();
            const pageCount = textResult.total;
            const confidence = this.calculateConfidence(text);
            return {
                text,
                confidence,
                pageCount,
            };
        }
        catch (error) {
            console.error('PDF extraction error:', error);
            return {
                text: '',
                confidence: 0,
                error: 'Failed to extract text from PDF',
            };
        }
        finally {
            if (pdfParser) {
                await pdfParser.destroy();
            }
        }
    }
    async extractFromDocx(fileBuffer) {
        try {
            const result = await mammoth_1.default.extractRawText({ buffer: fileBuffer });
            const text = result.value.trim();
            const confidence = this.calculateConfidence(text);
            return {
                text,
                confidence,
            };
        }
        catch (error) {
            console.error('DOCX extraction error:', error);
            return {
                text: '',
                confidence: 0,
                error: 'Failed to extract text from DOCX',
            };
        }
    }
    calculateConfidence(text) {
        if (!text || text.length < 50) {
            return 0;
        }
        let confidence = 50;
        const cvIndicators = [
            /education/i,
            /experience/i,
            /skills/i,
            /work history/i,
            /employment/i,
            /qualifications/i,
            /projects/i,
            /certifications/i,
            /contact/i,
            /email/i,
            /phone/i,
            /linkedin/i,
        ];
        const matchedIndicators = cvIndicators.filter((regex) => regex.test(text));
        confidence += matchedIndicators.length * 4;
        if (text.length > 500)
            confidence += 10;
        if (text.length > 1000)
            confidence += 10;
        if (text.length > 2000)
            confidence += 5;
        if (/[\w.-]+@[\w.-]+\.\w+/.test(text))
            confidence += 5;
        if (/[\d\s\-\+\(\)]{10,}/.test(text))
            confidence += 5;
        return Math.min(confidence, 100);
    }
    validateFile(file) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!this.supportedExtensions.includes(ext)) {
            return {
                valid: false,
                error: `Unsupported file type: ${ext}. Supported: ${this.supportedExtensions.join(', ')}`,
            };
        }
        if (file.size > this.maxFileSize) {
            return {
                valid: false,
                error: 'File size exceeds 10MB limit',
            };
        }
        return { valid: true };
    }
    getSupportedExtensions() {
        return [...this.supportedExtensions];
    }
    async extractTextFromFile(filePathOrKey) {
        try {
            let fileBuffer;
            let fileName;
            if (filePathOrKey.startsWith('s3://') ||
                (!filePathOrKey.startsWith('/') && !filePathOrKey.startsWith('.'))) {
                this.logger.debug(`Downloading file from storage: ${filePathOrKey}`);
                fileBuffer = await this.storageService.downloadFile(filePathOrKey);
                fileName = path.basename(filePathOrKey);
            }
            else if (filePathOrKey.startsWith('/uploads/')) {
                this.logger.debug(`Downloading file from local path via storage: ${filePathOrKey}`);
                fileBuffer = await this.storageService.downloadFile(filePathOrKey);
                fileName = path.basename(filePathOrKey);
            }
            else {
                this.logger.debug(`Reading file directly from filesystem: ${filePathOrKey}`);
                fileBuffer = await fs.readFile(filePathOrKey);
                fileName = path.basename(filePathOrKey);
            }
            return this.extractText(fileBuffer, fileName);
        }
        catch (error) {
            this.logger.error(`Error reading file ${filePathOrKey}:`, error);
            return {
                text: '',
                confidence: 0,
                error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
};
exports.FileProcessingService = FileProcessingService;
exports.FileProcessingService = FileProcessingService = FileProcessingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [storage_service_1.StorageService])
], FileProcessingService);
//# sourceMappingURL=file-processing.service.js.map