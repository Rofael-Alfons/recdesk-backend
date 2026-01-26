import { BillingService } from './billing.service';
export declare class BillingScheduler {
    private billingService;
    private readonly logger;
    constructor(billingService: BillingService);
    checkExpiredSubscriptions(): Promise<void>;
    sendTrialExpirationWarnings(): Promise<void>;
    checkGracePeriods(): Promise<void>;
    seedSubscriptionPlans(): Promise<void>;
}
