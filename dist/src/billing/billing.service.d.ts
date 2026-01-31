import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsageType } from '@prisma/client';
export interface UsageStats {
    cvProcessed: number;
    cvLimit: number;
    cvUsagePercentage: number;
    aiCalls: number;
    aiCallLimit: number;
    aiCallUsagePercentage: number;
    emailsSent: number;
    emailSentLimit: number;
    emailSentUsagePercentage: number;
    emailsImported: number;
    emailImportLimit: number;
    emailImportUsagePercentage: number;
    periodStart: Date;
    periodEnd: Date;
}
export interface PlanDetails {
    id: string;
    name: string;
    stripePriceId: string | null;
    monthlyPrice: number;
    annualPrice: number | null;
    cvLimit: number;
    aiCallLimit: number;
    emailSentLimit: number;
    emailImportLimit: number;
    userLimit: number;
    features: Record<string, boolean>;
    isCurrentPlan: boolean;
}
export declare class BillingService {
    private prisma;
    private configService;
    private notificationsService;
    private readonly logger;
    private stripe;
    constructor(prisma: PrismaService, configService: ConfigService, notificationsService: NotificationsService);
    private ensureStripe;
    getPlans(companyId?: string): Promise<PlanDetails[]>;
    getSubscription(companyId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SubscriptionStatus;
        plan: {
            id: string;
            name: string;
            cvLimit: number;
            userLimit: number;
            features: import("@prisma/client/runtime/library").JsonValue;
        };
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
        cancelAtPeriodEnd: boolean;
        trialEndsAt: Date | null;
    } | null>;
    createCheckoutSession(companyId: string, priceId: string, successUrl: string, cancelUrl: string): Promise<{
        sessionId: string;
        url: string;
    }>;
    createPortalSession(companyId: string, returnUrl: string): Promise<{
        url: string;
    }>;
    handleWebhook(payload: Buffer, signature: string): Promise<void>;
    private handleCheckoutCompleted;
    private handleInvoicePaid;
    private handleInvoicePaymentFailed;
    private handleSubscriptionUpdated;
    private handleSubscriptionDeleted;
    private mapStripeStatus;
    getUsage(companyId: string): Promise<UsageStats>;
    trackUsage(companyId: string, type: UsageType, count?: number): Promise<void>;
    checkLimit(companyId: string, type: UsageType): Promise<{
        allowed: boolean;
        current: number;
        limit: number;
        message?: string;
    }>;
    getInvoices(companyId: string): Promise<{
        id: string;
        createdAt: Date;
        companyId: string;
        status: import("@prisma/client").$Enums.InvoiceStatus;
        periodStart: Date;
        periodEnd: Date;
        stripeInvoiceId: string;
        amountDue: number;
        amountPaid: number;
        currency: string;
        invoicePdf: string | null;
        hostedInvoiceUrl: string | null;
        paidAt: Date | null;
    }[]>;
    createTrialSubscription(companyId: string): Promise<void>;
    seedPlans(): Promise<void>;
    private readonly GRACE_PERIOD_DAYS;
    checkAndExpireSubscriptions(): Promise<{
        expired: number;
        notified: number;
    }>;
    sendTrialWarnings(): Promise<{
        notified: number;
    }>;
    startGracePeriod(companyId: string): Promise<void>;
    checkGracePeriods(): Promise<{
        expired: number;
    }>;
    isSubscriptionActive(companyId: string): Promise<{
        active: boolean;
        reason?: string;
        daysUntilExpiration?: number;
    }>;
}
