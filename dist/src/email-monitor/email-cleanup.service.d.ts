import { PrismaService } from '../prisma/prisma.service';
export declare class EmailCleanupService {
    private prisma;
    private readonly logger;
    private readonly retentionDays;
    constructor(prisma: PrismaService);
    cleanupOldSkippedEmails(): Promise<void>;
}
