import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsageType, SubscriptionStatus } from '@prisma/client';

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

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeSecretKey) {
      this.stripe = new Stripe(stripeSecretKey);
    } else {
      this.logger.warn('Stripe secret key not configured - billing features disabled');
    }
  }

  private ensureStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured');
    }
    return this.stripe;
  }

  /**
   * Get all available subscription plans
   */
  async getPlans(companyId?: string): Promise<PlanDetails[]> {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    let currentPlanId: string | null = null;
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
      features: plan.features as Record<string, boolean>,
      isCurrentPlan: plan.id === currentPlanId,
    }));
  }

  /**
   * Get current subscription for a company
   */
  async getSubscription(companyId: string) {
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

  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(
    companyId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ sessionId: string; url: string }> {
    const stripe = this.ensureStripe();

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { users: { where: { role: 'ADMIN' }, take: 1 } },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Get or create Stripe customer
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

    // Create checkout session
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

  /**
   * Create Stripe customer portal session
   */
  async createPortalSession(
    companyId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const stripe = this.ensureStripe();

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company?.stripeCustomerId) {
      throw new BadRequestException('No billing account found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const stripe = this.ensureStripe();
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      this.logger.error('Webhook signature verification failed:', err);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Handle checkout.session.completed
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const companyId = session.metadata?.companyId;
    if (!companyId) {
      this.logger.error('No companyId in checkout session metadata');
      return;
    }

    const subscriptionId = session.subscription as string;
    if (!subscriptionId) {
      this.logger.error('No subscription in checkout session');
      return;
    }

    const stripe = this.ensureStripe();
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;

    // Log the subscription data for debugging
    const subData = stripeSubscription as any;
    this.logger.log(`Stripe subscription data: ${JSON.stringify({
      id: stripeSubscription.id,
      status: stripeSubscription.status,
      current_period_start: subData.current_period_start,
      current_period_end: subData.current_period_end,
    })}`);

    // Find plan by Stripe price ID
    const priceId = stripeSubscription.items.data[0]?.price.id;
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { stripePriceId: priceId },
    });

    if (!plan) {
      this.logger.error(`No plan found for price ID: ${priceId}`);
      return;
    }

    // Get period timestamps from Stripe subscription (cast to any for compatibility)
    const periodStartTimestamp = subData.current_period_start as number | undefined;
    const periodEndTimestamp = subData.current_period_end as number | undefined;

    // Validate timestamps before creating dates
    const now = new Date();
    const periodStart = periodStartTimestamp && !isNaN(periodStartTimestamp)
      ? new Date(periodStartTimestamp * 1000)
      : now;
    const periodEnd = periodEndTimestamp && !isNaN(periodEndTimestamp)
      ? new Date(periodEndTimestamp * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    // Create or update subscription
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

  /**
   * Handle invoice.paid
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const company = await this.prisma.company.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!company) {
      this.logger.error(`No company found for customer: ${customerId}`);
      return;
    }

    // Record invoice
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

    // Update subscription status to active
    await this.prisma.subscription.updateMany({
      where: { companyId: company.id },
      data: { status: 'ACTIVE' },
    });

    this.logger.log(`Invoice paid for company ${company.id}`);
  }

  /**
   * Handle invoice.payment_failed
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const company = await this.prisma.company.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!company) {
      return;
    }

    // Start grace period (this updates status to PAST_DUE and sends notification)
    await this.startGracePeriod(company.id);

    // Record failed invoice
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

  /**
   * Handle customer.subscription.updated
   */
  private async handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription) {
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

    // Find plan by Stripe price ID
    const priceId = stripeSubscription.items.data[0]?.price.id;
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { stripePriceId: priceId },
    });

    // Get period timestamps with validation (cast to any for compatibility)
    const subData = stripeSubscription as any;
    const periodStartTimestamp = subData.current_period_start as number | undefined;
    const periodEndTimestamp = subData.current_period_end as number | undefined;

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

  /**
   * Handle customer.subscription.deleted
   */
  private async handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription) {
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

  /**
   * Map Stripe subscription status to our status
   */
  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
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

  /**
   * Get usage stats for a company
   */
  async getUsage(companyId: string): Promise<UsageStats> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    const periodStart = subscription?.currentPeriodStart || new Date();
    const periodEnd = subscription?.currentPeriodEnd || new Date();

    // Get usage records for current period
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

    // Get limits from plan (with defaults for free trial)
    const cvLimit = subscription?.plan.cvLimit ?? 50;
    const aiCallLimit = subscription?.plan.aiCallLimit ?? -1;
    const emailSentLimit = subscription?.plan.emailSentLimit ?? -1;
    const emailImportLimit = subscription?.plan.emailImportLimit ?? -1;

    // Calculate usage percentages (0 for unlimited limits represented by -1)
    const calculatePercentage = (used: number, limit: number): number => {
      if (limit <= 0) return 0; // Unlimited or invalid limit
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

  /**
   * Track usage
   */
  async trackUsage(companyId: string, type: UsageType, count: number = 1): Promise<void> {
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

    // Check usage limits and send notifications for CV_PROCESSED type
    if (type === 'CV_PROCESSED') {
      await this.notificationsService.checkAndNotifyUsageLimits(companyId);
    }
  }

  /**
   * Check if company has reached usage limit
   */
  async checkLimit(companyId: string, type: UsageType): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    message?: string;
  }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    if (!subscription) {
      // No subscription - use free trial limits
      return { allowed: true, current: 0, limit: 50 };
    }

    const usage = await this.getUsage(companyId);

    // Helper function to check limits
    const checkUsageLimit = (
      current: number,
      limit: number,
      resourceName: string,
    ): { allowed: boolean; current: number; limit: number; message?: string } => {
      if (limit === -1) {
        // Unlimited
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
        return checkUsageLimit(
          usage.cvProcessed,
          subscription.plan.cvLimit,
          'CV processing',
        );

      case 'AI_PARSING_CALL':
      case 'AI_SCORING_CALL':
        return checkUsageLimit(
          usage.aiCalls,
          subscription.plan.aiCallLimit,
          'AI call',
        );

      case 'EMAIL_SENT':
        return checkUsageLimit(
          usage.emailsSent,
          subscription.plan.emailSentLimit,
          'email sending',
        );

      case 'EMAIL_IMPORTED':
        return checkUsageLimit(
          usage.emailsImported,
          subscription.plan.emailImportLimit,
          'email import',
        );

      default:
        return { allowed: true, current: 0, limit: -1 };
    }
  }

  /**
   * Get invoices for a company
   */
  async getInvoices(companyId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return invoices;
  }

  /**
   * Create a free trial subscription
   */
  async createTrialSubscription(companyId: string): Promise<void> {
    // Find or create free trial plan
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
    trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

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

  /**
   * Seed subscription plans
   */
  async seedPlans(): Promise<void> {
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
        stripePriceId: this.configService.get<string>('STRIPE_STARTER_PRICE_ID'),
        monthlyPrice: 4900, // $49
        annualPrice: 47000, // $470 (2 months free)
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
        stripePriceId: this.configService.get<string>('STRIPE_PROFESSIONAL_PRICE_ID'),
        monthlyPrice: 9900, // $99
        annualPrice: 95000, // $950 (2 months free)
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
        stripePriceId: this.configService.get<string>('STRIPE_ENTERPRISE_PRICE_ID'),
        monthlyPrice: 29900, // $299
        annualPrice: 287000, // $2870 (2 months free)
        cvLimit: -1, // Unlimited
        aiCallLimit: -1, // Unlimited
        emailSentLimit: -1, // Unlimited
        emailImportLimit: -1, // Unlimited
        userLimit: -1, // Unlimited
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
      // Check if plan already exists by name
      const existingPlan = await this.prisma.subscriptionPlan.findFirst({
        where: { name: plan.name },
      });

      if (existingPlan) {
        // Update existing plan
        await this.prisma.subscriptionPlan.update({
          where: { id: existingPlan.id },
          data: plan as any,
        });
        this.logger.log(`Updated plan: ${plan.name}`);
      } else {
        // Create new plan
        await this.prisma.subscriptionPlan.create({
          data: plan as any,
        });
        this.logger.log(`Created plan: ${plan.name}`);
      }
    }

    this.logger.log('Subscription plans seeded');
  }

  // ============================================
  // SUBSCRIPTION EXPIRATION & GRACE PERIOD
  // ============================================

  /**
   * Grace period duration in days
   */
  private readonly GRACE_PERIOD_DAYS = 7;

  /**
   * Check and expire subscriptions that have passed their period end
   * Called by the billing scheduler daily
   */
  async checkAndExpireSubscriptions(): Promise<{
    expired: number;
    notified: number;
  }> {
    const now = new Date();
    let expired = 0;
    let notified = 0;

    // Find active subscriptions that have passed their period end
    const expiredSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lt: now },
      },
      include: { company: true },
    });

    for (const subscription of expiredSubscriptions) {
      // Update status to EXPIRED
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      });

      // Send notification
      await this.notificationsService.notifySubscriptionExpired(subscription.companyId);

      expired++;
      notified++;
      this.logger.log(`Expired subscription for company ${subscription.companyId}`);
    }

    // Also handle expired trials
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

  /**
   * Send trial expiration warnings
   * Called by the billing scheduler daily
   */
  async sendTrialWarnings(): Promise<{ notified: number }> {
    const now = new Date();
    let notified = 0;

    // Find trials ending in 3 days
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

    // Find trials ending in 1 day
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

  /**
   * Handle grace period for failed payments
   * Called when a payment fails (from webhook)
   */
  async startGracePeriod(companyId: string): Promise<void> {
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

  /**
   * Check and handle expired grace periods
   * Called by the billing scheduler daily
   */
  async checkGracePeriods(): Promise<{ expired: number }> {
    const now = new Date();
    let expired = 0;

    // Find subscriptions with expired grace periods
    const expiredGracePeriods = await this.prisma.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        gracePeriodEndsAt: { lt: now },
      },
    });

    for (const subscription of expiredGracePeriods) {
      // Update status to UNPAID (access should be restricted)
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'UNPAID',
          gracePeriodEndsAt: null, // Clear grace period
        },
      });

      expired++;
      this.logger.log(`Grace period expired for company ${subscription.companyId}`);
    }

    this.logger.log(`Grace period check complete: ${expired} expired`);
    return { expired };
  }

  /**
   * Check if a subscription is active (considering status, expiration, and grace period)
   */
  async isSubscriptionActive(companyId: string): Promise<{
    active: boolean;
    reason?: string;
    daysUntilExpiration?: number;
  }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    if (!subscription) {
      return { active: false, reason: 'No subscription found' };
    }

    const now = new Date();

    // Check status
    const inactiveStatuses: SubscriptionStatus[] = ['CANCELED', 'UNPAID', 'INCOMPLETE_EXPIRED', 'EXPIRED'];
    if (inactiveStatuses.includes(subscription.status)) {
      return { active: false, reason: `Subscription is ${subscription.status.toLowerCase()}` };
    }

    // Check if trial expired
    if (subscription.status === 'TRIALING' && subscription.trialEndsAt) {
      if (new Date(subscription.trialEndsAt) < now) {
        return { active: false, reason: 'Trial has expired' };
      }
      const daysUntilExpiration = Math.ceil(
        (new Date(subscription.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return { active: true, daysUntilExpiration };
    }

    // Check if subscription period has ended
    if (new Date(subscription.currentPeriodEnd) < now) {
      // Check if in grace period
      if (subscription.status === 'PAST_DUE' && subscription.gracePeriodEndsAt) {
        if (new Date(subscription.gracePeriodEndsAt) > now) {
          const daysUntilExpiration = Math.ceil(
            (new Date(subscription.gracePeriodEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          return { active: true, reason: 'In grace period', daysUntilExpiration };
        }
      }
      return { active: false, reason: 'Subscription period has ended' };
    }

    const daysUntilExpiration = Math.ceil(
      (new Date(subscription.currentPeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return { active: true, daysUntilExpiration };
  }
}
