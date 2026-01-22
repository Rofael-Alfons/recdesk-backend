import { UploadService } from './upload.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class UploadController {
    private uploadService;
    constructor(uploadService: UploadService);
    uploadCVs(files: Express.Multer.File[], jobId: string | undefined, user: CurrentUserData): Promise<import("./upload.service").BulkUploadResult>;
}
