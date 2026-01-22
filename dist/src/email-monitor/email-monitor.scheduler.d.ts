import { EmailMonitorService } from './email-monitor.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class EmailMonitorScheduler {
    private emailMonitorService;
    private prisma;
    private readonly logger;
    private isRunning;
    constructor(emailMonitorService: EmailMonitorService, prisma: PrismaService);
    handleEmailPolling(): Promise<void>;
    handleTokenRefresh(): Promise<void>;
}
