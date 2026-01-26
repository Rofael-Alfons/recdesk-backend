"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var BillingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const stripe_1 = __importDefault(require("stripe"));
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
let BillingService = BillingService_1 = class BillingService {
    prisma;
    configService;
    notificationsService;
    logger = new common_1.Logger(BillingService_1.name);
    stripe = null;
    constructor(prisma, configService, notificationsService) {
        this.prisma = prisma;
        this.configService = configService;
        this.notificationsService = notificationsService;
        const stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');
        if (stripeSecretKey) {
            this.stripe = new stripe_1.default(stripeSecretKey);
        }
        else {
            this.logger.warn('Stripe secret key not configured - billing features disabled');
        }
    }
    ensureStripe() {
        if (!this.stripe) {
            throw new common_1.BadRequestException('Stripe is not configured');
        }
        return this.stripe;
    }
    async getPlans(companyId) {
        const plans = await this.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        });
        let currentPlanId = null;
        if (companyId) {
            const subscription = await this.prisma.subscription.findUnique({
                where: { companyId },
            });
            currentPlanId = subscription?.planId || null;
        }
        return plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            stripePriceId: plan.stripePriceId,
            monthlyPrice: plan.monthlyPrice,
            annualPrice: plan.annualPrice,
            cvLimit: plan.cvLimit,
            aiCallLimit: plan.aiCallLimit,
            emailSentLimit: plan.emailSentLimit,
            emailImportLimit: plan.emailImportLimit,
            userLimit: plan.userLimit,
            features: plan.features,
            isCurrentPlan: plan.id === currentPlanId,
        }));
    }
    async getSubscription(companyId) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
            include: {
                plan: true,
                company: {
                    select: {
                        id: true,
                        name: true,
                        stripeCustomerId: true,
                    },
                },
            },
        });
        if (!subscription) {
            return null;
        }
        return {
            id: subscription.id,
            status: subscription.status,
            plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                cvLimit: subscription.plan.cvLimit,
                userLimit: subscription.plan.userLimit,
                features: subscription.plan.features,
            },
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            trialEndsAt: subscription.trialEndsAt,
        };
    }
    async createCheckoutSession(companyId, priceId, successUrl, cancelUrl) {
        const stripe = this.ensureStripe();
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            include: { users: { where: { role: 'ADMIN' }, take: 1 } },
        });
        if (!company) {
            throw new common_1.NotFoundException('Company not found');
        }
        let customerId = company.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                name: company.name,
                email: company.users[0]?.email,
                metadata: { companyId },
            });
            customerId = customer.id;
            await this.prisma.company.update({
                where: { id: companyId },
                data: { stripeCustomerId: customerId },
            });
        }
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: { companyId },
            subscription_data: {
                metadata: { companyId },
            },
        });
        return {
            sessionId: session.id,
            url: session.url || '',
        };
    }
    async createPortalSession(companyId, returnUrl) {
        const stripe = this.ensureStripe();
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company?.stripeCustomerId) {
            throw new common_1.BadRequestException('No billing account found');
        }
        const session = await stripe.billingPortal.sessions.create({
            customer: company.stripeCustomerId,
            return_url: returnUrl,
        });
        return { url: session.url };
    }
    async handleWebhook(payload, signature) {
        const stripe = this.ensureStripe();
        const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
        if (!webhookSecret) {
            throw new common_1.BadRequestException('Webhook secret not configured');
        }
        let event;
        try {
            event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        }
        catch (err) {
            this.logger.error('Webhook signature verification failed:', err);
            throw new common_1.BadRequestException('Invalid webhook signature');
        }
        this.logger.log(`Processing webhook event: ${event.type}`);
        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutCompleted(event.data.object);
                break;
            case 'invoice.paid':
                await this.handleInvoicePaid(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handleInvoicePaymentFailed(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            default:
                this.logger.log(`Unhandled event type: ${event.type}`);
        }
    }
    async handleCheckoutCompleted(session) {
        const companyId = session.metadata?.companyId;
        if (!companyId) {
            this.logger.error('No companyId in checkout session metadata');
            return;
        }
        const subscriptionId = session.subscription;
        if (!subscriptionId) {
            this.logger.error('No subscription in checkout session');
            return;
        }
        const stripe = this.ensureStripe();
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        const subData = stripeSubscription;
        this.logger.log(`Stripe subscription data: ${JSON.stringify({
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            current_period_start: subData.current_period_start,
            current_period_end: subData.current_period_end,
        })}`);
        const priceId = stripeSubscription.items.data[0]?.price.id;
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { stripePriceId: priceId },
        });
        if (!plan) {
            this.logger.error(`No plan found for price ID: ${priceId}`);
            return;
        }
        const periodStartTimestamp = subData.current_period_start;
        const periodEndTimestamp = subData.current_period_end;
        const now = new Date();
        const periodStart = periodStartTimestamp && !isNaN(periodStartTimestamp)
            ? new Date(periodStartTimestamp * 1000)
            : now;
        const periodEnd = periodEndTimestamp && !isNaN(periodEndTimestamp)
            ? new Date(periodEndTimestamp * 1000)
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await this.prisma.subscription.upsert({
            where: { companyId },
            create: {
                companyId,
                planId: plan.id,
                stripeSubscriptionId: subscriptionId,
                status: this.mapStripeStatus(stripeSubscription.status),
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
            },
            update: {
                planId: plan.id,
                stripeSubscriptionId: subscriptionId,
                status: this.mapStripeStatus(stripeSubscription.status),
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
            },
        });
        this.logger.log(`Subscription activated for company ${companyId}`);
    }
    async handleInvoicePaid(invoice) {
        const customerId = invoice.customer;
        const company = await this.prisma.company.findFirst({
            where: { stripeCustomerId: customerId },
        });
        if (!company) {
            this.logger.error(`No company found for customer: ${customerId}`);
            return;
        }
        await this.prisma.invoice.upsert({
            where: { stripeInvoiceId: invoice.id },
            create: {
                stripeInvoiceId: invoice.id,
                companyId: company.id,
                amountDue: invoice.amount_due,
                amountPaid: invoice.amount_paid,
                currency: invoice.currency,
                status: 'PAID',
                invoicePdf: invoice.invoice_pdf || null,
                hostedInvoiceUrl: invoice.hosted_invoice_url || null,
                periodStart: new Date(invoice.period_start * 1000),
                periodEnd: new Date(invoice.period_end * 1000),
                paidAt: new Date(),
            },
            update: {
                amountPaid: invoice.amount_paid,
                status: 'PAID',
                paidAt: new Date(),
            },
        });
        await this.prisma.subscription.updateMany({
            where: { companyId: company.id },
            data: { status: 'ACTIVE' },
        });
        this.logger.log(`Invoice paid for company ${company.id}`);
    }
    async handleInvoicePaymentFailed(invoice) {
        const customerId = invoice.customer;
        const company = await this.prisma.company.findFirst({
            where: { stripeCustomerId: customerId },
        });
        if (!company) {
            return;
        }
        await this.startGracePeriod(company.id);
        await this.prisma.invoice.upsert({
            where: { stripeInvoiceId: invoice.id },
            create: {
                stripeInvoiceId: invoice.id,
                companyId: company.id,
                amountDue: invoice.amount_due,
                amountPaid: invoice.amount_paid,
                currency: invoice.currency,
                status: 'OPEN',
                periodStart: new Date(invoice.period_start * 1000),
                periodEnd: new Date(invoice.period_end * 1000),
            },
            update: {
                status: 'OPEN',
            },
        });
        this.logger.warn(`Payment failed for company ${company.id}`);
    }
    async handleSubscriptionUpdated(stripeSubscription) {
        const companyId = stripeSubscription.metadata?.companyId;
        if (!companyId) {
            return;
        }
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
        });
        if (!subscription) {
            return;
        }
        const priceId = stripeSubscription.items.data[0]?.price.id;
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { stripePriceId: priceId },
        });
        const subData = stripeSubscription;
        const periodStartTimestamp = subData.current_period_start;
        const periodEndTimestamp = subData.current_period_end;
        const periodStart = periodStartTimestamp && !isNaN(periodStartTimestamp)
            ? new Date(periodStartTimestamp * 1000)
            : subscription.currentPeriodStart;
        const periodEnd = periodEndTimestamp && !isNaN(periodEndTimestamp)
            ? new Date(periodEndTimestamp * 1000)
            : subscription.currentPeriodEnd;
        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                planId: plan?.id || subscription.planId,
                status: this.mapStripeStatus(stripeSubscription.status),
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
            },
        });
        this.logger.log(`Subscription updated for company ${companyId}`);
    }
    async handleSubscriptionDeleted(stripeSubscription) {
        const companyId = stripeSubscription.metadata?.companyId;
        if (!companyId) {
            return;
        }
        await this.prisma.subscription.updateMany({
            where: { companyId },
            data: { status: 'CANCELED' },
        });
        this.logger.log(`Subscription canceled for company ${companyId}`);
    }
    mapStripeStatus(status) {
        const statusMap = {
            trialing: 'TRIALING',
            active: 'ACTIVE',
            past_due: 'PAST_DUE',
            canceled: 'CANCELED',
            unpaid: 'UNPAID',
            incomplete: 'INCOMPLETE',
            incomplete_expired: 'INCOMPLETE_EXPIRED',
        };
        return statusMap[status] || 'ACTIVE';
    }
    async getUsage(companyId) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
            include: { plan: true },
        });
        const periodStart = subscription?.currentPeriodStart || new Date();
        const periodEnd = subscription?.currentPeriodEnd || new Date();
        const usageRecords = await this.prisma.usageRecord.findMany({
            where: {
                companyId,
                periodStart: { gte: periodStart },
                periodEnd: { lte: periodEnd },
            },
        });
        const cvProcessed = usageRecords
            .filter((r) => r.type === 'CV_PROCESSED')
            .reduce((sum, r) => sum + r.count, 0);
        const aiCalls = usageRecords
            .filter((r) => r.type === 'AI_PARSING_CALL' || r.type === 'AI_SCORING_CALL')
            .reduce((sum, r) => sum + r.count, 0);
        const emailsSent = usageRecords
            .filter((r) => r.type === 'EMAIL_SENT')
            .reduce((sum, r) => sum + r.count, 0);
        const emailsImported = usageRecords
            .filter((r) => r.type === 'EMAIL_IMPORTED')
            .reduce((sum, r) => sum + r.count, 0);
        const cvLimit = subscription?.plan.cvLimit ?? 50;
        const aiCallLimit = subscription?.plan.aiCallLimit ?? -1;
        const emailSentLimit = subscription?.plan.emailSentLimit ?? -1;
        const emailImportLimit = subscription?.plan.emailImportLimit ?? -1;
        const calculatePercentage = (used, limit) => {
            if (limit <= 0)
                return 0;
            return Math.round((used / limit) * 100);
        };
        return {
            cvProcessed,
            cvLimit,
            cvUsagePercentage: calculatePercentage(cvProcessed, cvLimit),
            aiCalls,
            aiCallLimit,
            aiCallUsagePercentage: calculatePercentage(aiCalls, aiCallLimit),
            emailsSent,
            emailSentLimit,
            emailSentUsagePercentage: calculatePercentage(emailsSent, emailSentLimit),
            emailsImported,
            emailImportLimit,
            emailImportUsagePercentage: calculatePercentage(emailsImported, emailImportLimit),
            periodStart,
            periodEnd,
        };
    }
    async trackUsage(companyId, type, count = 1) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
        });
        const periodStart = subscription?.currentPeriodStart || new Date();
        const periodEnd = subscription?.currentPeriodEnd || new Date();
        await this.prisma.usageRecord.create({
            data: {
                companyId,
                type,
                count,
                periodStart,
                periodEnd,
            },
        });
        if (type === 'CV_PROCESSED') {
            await this.notificationsService.checkAndNotifyUsageLimits(companyId);
        }
    }
    async checkLimit(companyId, type) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
            include: { plan: true },
        });
        if (!subscription) {
            return { allowed: true, current: 0, limit: 50 };
        }
        const usage = await this.getUsage(companyId);
        const checkUsageLimit = (current, limit, resourceName) => {
            if (limit === -1) {
                return { allowed: true, current, limit: -1 };
            }
            if (current >= limit) {
                return {
                    allowed: false,
                    current,
                    limit,
                    message: `You have reached your ${resourceName} limit of ${limit} this month. Please upgrade your plan.`,
                };
            }
            return { allowed: true, current, limit };
        };
        switch (type) {
            case 'CV_PROCESSED':
                return checkUsageLimit(usage.cvProcessed, subscription.plan.cvLimit, 'CV processing');
            case 'AI_PARSING_CALL':
            case 'AI_SCORING_CALL':
                return checkUsageLimit(usage.aiCalls, subscription.plan.aiCallLimit, 'AI call');
            case 'EMAIL_SENT':
                return checkUsageLimit(usage.emailsSent, subscription.plan.emailSentLimit, 'email sending');
            case 'EMAIL_IMPORTED':
                return checkUsageLimit(usage.emailsImported, subscription.plan.emailImportLimit, 'email import');
            default:
                return { allowed: true, current: 0, limit: -1 };
        }
    }
    async getInvoices(companyId) {
        const invoices = await this.prisma.invoice.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        return invoices;
    }
    async createTrialSubscription(companyId) {
        let trialPlan = await this.prisma.subscriptionPlan.findFirst({
            where: { name: 'Free Trial' },
        });
        if (!trialPlan) {
            trialPlan = await this.prisma.subscriptionPlan.create({
                data: {
                    name: 'Free Trial',
                    monthlyPrice: 0,
                    cvLimit: 50,
                    aiCallLimit: 100,
                    emailSentLimit: 50,
                    emailImportLimit: 100,
                    userLimit: 3,
                    features: {
                        emailIntegration: true,
                        bulkUpload: true,
                        aiParsing: true,
                        aiScoring: true,
                        csvExport: true,
                        pipelineManagement: false,
                        teamCollaboration: false,
                    },
                    sortOrder: 0,
                },
            });
        }
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);
        await this.prisma.subscription.create({
            data: {
                companyId,
                planId: trialPlan.id,
                status: 'TRIALING',
                currentPeriodStart: new Date(),
                currentPeriodEnd: trialEndsAt,
                trialEndsAt,
            },
        });
        this.logger.log(`Created trial subscription for company ${companyId}`);
    }
    async seedPlans() {
        const plans = [
            {
                name: 'Free Trial',
                monthlyPrice: 0,
                cvLimit: 50,
                aiCallLimit: 100,
                emailSentLimit: 50,
                emailImportLimit: 100,
                userLimit: 3,
                features: {
                    emailIntegration: true,
                    bulkUpload: true,
                    aiParsing: true,
                    aiScoring: true,
                    csvExport: true,
                    pipelineManagement: false,
                    teamCollaboration: false,
                },
                sortOrder: 0,
            },
            {
                name: 'Starter',
                stripePriceId: this.configService.get('STRIPE_STARTER_PRICE_ID'),
                monthlyPrice: 4900,
                annualPrice: 47000,
                cvLimit: 500,
                aiCallLimit: 1000,
                emailSentLimit: 500,
                emailImportLimit: 1000,
                userLimit: 3,
                features: {
                    emailIntegration: true,
                    bulkUpload: true,
                    aiParsing: true,
                    aiScoring: true,
                    csvExport: true,
                    pipelineManagement: false,
                    teamCollaboration: false,
                    emailSupport: true,
                },
                sortOrder: 1,
            },
            {
                name: 'Professional',
                stripePriceId: this.configService.get('STRIPE_PROFESSIONAL_PRICE_ID'),
                monthlyPrice: 9900,
                annualPrice: 95000,
                cvLimit: 2000,
                aiCallLimit: 5000,
                emailSentLimit: 2000,
                emailImportLimit: 5000,
                userLimit: 10,
                features: {
                    emailIntegration: true,
                    bulkUpload: true,
                    aiParsing: true,
                    aiScoring: true,
                    csvExport: true,
                    pipelineManagement: true,
                    teamCollaboration: true,
                    emailSupport: true,
                    prioritySupport: true,
                },
                sortOrder: 2,
            },
            {
                name: 'Enterprise',
                stripePriceId: this.configService.get('STRIPE_ENTERPRISE_PRICE_ID'),
                monthlyPrice: 29900,
                annualPrice: 287000,
                cvLimit: -1,
                aiCallLimit: -1,
                emailSentLimit: -1,
                emailImportLimit: -1,
                userLimit: -1,
                features: {
                    emailIntegration: true,
                    bulkUpload: true,
                    aiParsing: true,
                    aiScoring: true,
                    csvExport: true,
                    pipelineManagement: true,
                    teamCollaboration: true,
                    emailSupport: true,
                    prioritySupport: true,
                    dedicatedSupport: true,
                    customIntegrations: true,
                    sla: true,
                },
                sortOrder: 3,
            },
        ];
        for (const plan of plans) {
            const existingPlan = await this.prisma.subscriptionPlan.findFirst({
                where: { name: plan.name },
            });
            if (existingPlan) {
                await this.prisma.subscriptionPlan.update({
                    where: { id: existingPlan.id },
                    data: plan,
                });
                this.logger.log(`Updated plan: ${plan.name}`);
            }
            else {
                await this.prisma.subscriptionPlan.create({
                    data: plan,
                });
                this.logger.log(`Created plan: ${plan.name}`);
            }
        }
        this.logger.log('Subscription plans seeded');
    }
    GRACE_PERIOD_DAYS = 7;
    async checkAndExpireSubscriptions() {
        const now = new Date();
        let expired = 0;
        let notified = 0;
        const expiredSubscriptions = await this.prisma.subscription.findMany({
            where: {
                status: 'ACTIVE',
                currentPeriodEnd: { lt: now },
            },
            include: { company: true },
        });
        for (const subscription of expiredSubscriptions) {
            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: { status: 'EXPIRED' },
            });
            await this.notificationsService.notifySubscriptionExpired(subscription.companyId);
            expired++;
            notified++;
            this.logger.log(`Expired subscription for company ${subscription.companyId}`);
        }
        const expiredTrials = await this.prisma.subscription.findMany({
            where: {
                status: 'TRIALING',
                trialEndsAt: { lt: now },
            },
        });
        for (const subscription of expiredTrials) {
            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: { status: 'EXPIRED' },
            });
            await this.notificationsService.notifyTrialExpired(subscription.companyId);
            expired++;
            notified++;
            this.logger.log(`Expired trial for company ${subscription.companyId}`);
        }
        this.logger.log(`Expiration check complete: ${expired} expired, ${notified} notified`);
        return { expired, notified };
    }
    async sendTrialWarnings() {
        const now = new Date();
        let notified = 0;
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
        const trialsEndingIn3Days = await this.prisma.subscription.findMany({
            where: {
                status: 'TRIALING',
                trialEndsAt: {
                    gte: threeDaysFromNow,
                    lt: fourDaysFromNow,
                },
            },
        });
        for (const subscription of trialsEndingIn3Days) {
            await this.notificationsService.notifyTrialExpiring(subscription.companyId, 3);
            notified++;
        }
        const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        const trialsEndingIn1Day = await this.prisma.subscription.findMany({
            where: {
                status: 'TRIALING',
                trialEndsAt: {
                    gte: oneDayFromNow,
                    lt: twoDaysFromNow,
                },
            },
        });
        for (const subscription of trialsEndingIn1Day) {
            await this.notificationsService.notifyTrialExpiring(subscription.companyId, 1);
            notified++;
        }
        this.logger.log(`Trial warning check complete: ${notified} notified`);
        return { notified };
    }
    async startGracePeriod(companyId) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
        });
        if (!subscription) {
            return;
        }
        const gracePeriodEndsAt = new Date();
        gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + this.GRACE_PERIOD_DAYS);
        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: 'PAST_DUE',
                gracePeriodEndsAt,
            },
        });
        await this.notificationsService.notifyPaymentFailed(companyId, this.GRACE_PERIOD_DAYS);
        this.logger.log(`Started grace period for company ${companyId}, ends at ${gracePeriodEndsAt}`);
    }
    async checkGracePeriods() {
        const now = new Date();
        let expired = 0;
        const expiredGracePeriods = await this.prisma.subscription.findMany({
            where: {
                status: 'PAST_DUE',
                gracePeriodEndsAt: { lt: now },
            },
        });
        for (const subscription of expiredGracePeriods) {
            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    status: 'UNPAID',
                    gracePeriodEndsAt: null,
                },
            });
            expired++;
            this.logger.log(`Grace period expired for company ${subscription.companyId}`);
        }
        this.logger.log(`Grace period check complete: ${expired} expired`);
        return { expired };
    }
    async isSubscriptionActive(companyId) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { companyId },
            include: { plan: true },
        });
        if (!subscription) {
            return { active: false, reason: 'No subscription found' };
        }
        const now = new Date();
        const inactiveStatuses = ['CANCELED', 'UNPAID', 'INCOMPLETE_EXPIRED', 'EXPIRED'];
        if (inactiveStatuses.includes(subscription.status)) {
            return { active: false, reason: `Subscription is ${subscription.status.toLowerCase()}` };
        }
        if (subscription.status === 'TRIALING' && subscription.trialEndsAt) {
            if (new Date(subscription.trialEndsAt) < now) {
                return { active: false, reason: 'Trial has expired' };
            }
            const daysUntilExpiration = Math.ceil((new Date(subscription.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return { active: true, daysUntilExpiration };
        }
        if (new Date(subscription.currentPeriodEnd) < now) {
            if (subscription.status === 'PAST_DUE' && subscription.gracePeriodEndsAt) {
                if (new Date(subscription.gracePeriodEndsAt) > now) {
                    const daysUntilExpiration = Math.ceil((new Date(subscription.gracePeriodEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    return { active: true, reason: 'In grace period', daysUntilExpiration };
                }
            }
            return { active: false, reason: 'Subscription period has ended' };
        }
        const daysUntilExpiration = Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { active: true, daysUntilExpiration };
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = BillingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        notifications_service_1.NotificationsService])
], BillingService);
//# sourceMappingURL=billing.service.js.map