import { EmailSendingService } from './email-sending.service';
import { SendEmailDto, BulkSendEmailDto, PreviewEmailDto } from './dto';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class EmailSendingController {
    private emailSendingService;
    constructor(emailSendingService: EmailSendingService);
    sendEmail(dto: SendEmailDto, user: CurrentUserData): Promise<import("./email-sending.service").SendResult>;
    bulkSendEmails(dto: BulkSendEmailDto, user: CurrentUserData): Promise<{
        total: number;
        successful: number;
        failed: number;
        results: import("./email-sending.service").SendResult[];
    }>;
    previewEmail(dto: PreviewEmailDto, user: CurrentUserData): Promise<{
        subject: string;
        body: string;
        tokens: string[];
    }>;
    getSentEmails(user: CurrentUserData, candidateId?: string, page?: string, limit?: string): Promise<{
        data: ({
            candidate: {
                id: string;
                fullName: string;
                email: string | null;
            };
            sentBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            id: string;
            candidateId: string;
            body: string;
            subject: string;
            sentAt: Date;
            openedAt: Date | null;
            clickedAt: Date | null;
            sentById: string;
        })[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
}
