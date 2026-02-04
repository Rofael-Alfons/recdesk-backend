import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreatePortalDto } from './dto/create-portal.dto';
interface AuthUser {
    userId: string;
    companyId: string;
    email: string;
    role: string;
}
export declare class BillingController {
    private billingService;
    constructor(billingService: BillingService);
    getPlans(user: AuthUser): Promise<import("./billing.service").PlanDetails[]>;
    getSubscription(user: AuthUser): Promise<any>;
    createCheckout(user: AuthUser, dto: CreateCheckoutDto): Promise<{
        sessionId: string;
        url: string;
    }>;
    createPortal(user: AuthUser, dto: CreatePortalDto): Promise<{
        url: string;
    }>;
    getUsage(user: AuthUser): Promise<import("./billing.service").UsageStats>;
    getInvoices(user: AuthUser): Promise<{
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
    seedPlans(): Promise<{
        message: string;
    }>;
}
export {};
