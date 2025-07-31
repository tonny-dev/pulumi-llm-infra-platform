import Stripe from 'stripe';
import { logger } from '@/shared/utils/logger';
import { 
  SubscriptionPlan, 
  SubscriptionStatus, 
  UsageMetrics, 
  BillingCycle,
  PricingTier 
} from '@/shared/types/subscription';
import { DatabaseService } from '@/services/database/DatabaseService';

export class SubscriptionService {
  private stripe: Stripe;
  private db: DatabaseService;

  constructor(
    private stripeSecretKey: string,
    databaseService: DatabaseService
  ) {
    this.stripe = new Stripe(this.stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
    this.db = databaseService;
  }

  // Pricing plans - competitive with CodeRabbit but more affordable
  private readonly PRICING_PLANS: Record<PricingTier, SubscriptionPlan> = {
    [PricingTier.FREE]: {
      id: 'free',
      name: 'Free',
      description: 'Perfect for individual developers and small projects',
      price: 0,
      billingCycle: BillingCycle.MONTHLY,
      features: {
        analysesPerMonth: 50,
        repositoriesLimit: 3,
        teamMembers: 1,
        supportLevel: 'community',
        advancedAnalytics: false,
        prioritySupport: false,
        customIntegrations: false,
        apiAccess: false,
        realtimeCollaboration: false,
        advancedSecurity: false
      },
      limits: {
        maxFileSize: 1024 * 1024, // 1MB
        maxBatchSize: 5,
        rateLimitPerHour: 20,
        storageGB: 1
      }
    },
    [PricingTier.STARTER]: {
      id: 'starter',
      name: 'Starter',
      description: 'Great for growing teams and active projects',
      price: 8, // vs CodeRabbit's $12
      billingCycle: BillingCycle.MONTHLY,
      stripeProductId: 'prod_starter',
      stripePriceId: 'price_starter_monthly',
      features: {
        analysesPerMonth: 500,
        repositoriesLimit: 10,
        teamMembers: 5,
        supportLevel: 'email',
        advancedAnalytics: true,
        prioritySupport: false,
        customIntegrations: false,
        apiAccess: true,
        realtimeCollaboration: true,
        advancedSecurity: false
      },
      limits: {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxBatchSize: 20,
        rateLimitPerHour: 100,
        storageGB: 10
      }
    },
    [PricingTier.PROFESSIONAL]: {
      id: 'professional',
      name: 'Professional',
      description: 'Perfect for professional teams and organizations',
      price: 20, // vs CodeRabbit's $30
      billingCycle: BillingCycle.MONTHLY,
      stripeProductId: 'prod_professional',
      stripePriceId: 'price_professional_monthly',
      features: {
        analysesPerMonth: 2000,
        repositoriesLimit: 50,
        teamMembers: 20,
        supportLevel: 'priority',
        advancedAnalytics: true,
        prioritySupport: true,
        customIntegrations: true,
        apiAccess: true,
        realtimeCollaboration: true,
        advancedSecurity: true
      },
      limits: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxBatchSize: 50,
        rateLimitPerHour: 500,
        storageGB: 100
      }
    },
    [PricingTier.ENTERPRISE]: {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Unlimited power for large organizations',
      price: 50, // vs CodeRabbit's $80
      billingCycle: BillingCycle.MONTHLY,
      stripeProductId: 'prod_enterprise',
      stripePriceId: 'price_enterprise_monthly',
      features: {
        analysesPerMonth: -1, // unlimited
        repositoriesLimit: -1, // unlimited
        teamMembers: -1, // unlimited
        supportLevel: 'dedicated',
        advancedAnalytics: true,
        prioritySupport: true,
        customIntegrations: true,
        apiAccess: true,
        realtimeCollaboration: true,
        advancedSecurity: true
      },
      limits: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        maxBatchSize: 200,
        rateLimitPerHour: -1, // unlimited
        storageGB: 1000
      }
    }
  };

  async createSubscription(
    userId: string, 
    planId: PricingTier, 
    billingCycle: BillingCycle = BillingCycle.MONTHLY
  ): Promise<{ subscriptionId: string; clientSecret?: string }> {
    try {
      const plan = this.PRICING_PLANS[planId];
      
      if (planId === PricingTier.FREE) {
        // Create free subscription directly in database
        const subscription = await this.db.subscriptions.create({
          userId,
          planId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          createdAt: new Date(),
          updatedAt: new Date()
        });

        return { subscriptionId: subscription.id };
      }

      // Get or create Stripe customer
      const user = await this.db.users.findById(userId);
      let customerId = user.stripeCustomerId;

      if (!customerId) {
        const customer = await this.stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { userId }
        });
        customerId = customer.id;
        
        await this.db.users.update(userId, { stripeCustomerId: customerId });
      }

      // Create Stripe subscription
      const priceId = billingCycle === BillingCycle.YEARLY 
        ? plan.stripePriceId?.replace('monthly', 'yearly')
        : plan.stripePriceId;

      const stripeSubscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: { userId, planId }
      });

      // Save subscription to database
      const subscription = await this.db.subscriptions.create({
        userId,
        stripeSubscriptionId: stripeSubscription.id,
        planId,
        status: SubscriptionStatus.INCOMPLETE,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const paymentIntent = (stripeSubscription.latest_invoice as any)?.payment_intent;
      
      return {
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret
      };

    } catch (error) {
      logger.error('Failed to create subscription', { error, userId, planId });
      throw error;
    }
  }

  async handleWebhook(signature: string, payload: string): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;
        
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancellation(event.data.object as Stripe.Subscription);
          break;
        
        case 'invoice.payment_succeeded':
          await this.handlePaymentSuccess(event.data.object as Stripe.Invoice);
          break;
        
        case 'invoice.payment_failed':
          await this.handlePaymentFailure(event.data.object as Stripe.Invoice);
          break;
      }
    } catch (error) {
      logger.error('Webhook handling failed', { error, signature });
      throw error;
    }
  }

  async checkUsageLimits(userId: string, action: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(userId);
    const plan = this.PRICING_PLANS[subscription.planId];
    const usage = await this.getCurrentUsage(userId);

    switch (action) {
      case 'analyze':
        return plan.features.analysesPerMonth === -1 || 
               usage.analysesThisMonth < plan.features.analysesPerMonth;
      
      case 'add_repository':
        return plan.features.repositoriesLimit === -1 || 
               usage.activeRepositories < plan.features.repositoriesLimit;
      
      case 'add_team_member':
        return plan.features.teamMembers === -1 || 
               usage.teamMembers < plan.features.teamMembers;
      
      default:
        return true;
    }
  }

  async getCurrentUsage(userId: string): Promise<UsageMetrics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [analyses, repositories, teamMembers] = await Promise.all([
      this.db.analyses.countByUserAndPeriod(userId, startOfMonth, now),
      this.db.repositories.countActiveByUser(userId),
      this.db.teamMembers.countByUser(userId)
    ]);

    return {
      analysesThisMonth: analyses,
      activeRepositories: repositories,
      teamMembers: teamMembers,
      storageUsedGB: await this.calculateStorageUsage(userId),
      apiCallsThisMonth: await this.db.apiCalls.countByUserAndPeriod(userId, startOfMonth, now)
    };
  }

  async getCurrentSubscription(userId: string): Promise<any> {
    return await this.db.subscriptions.findActiveByUser(userId);
  }

  getPricingPlans(): Record<PricingTier, SubscriptionPlan> {
    return this.PRICING_PLANS;
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;
    
    await this.db.subscriptions.updateByStripeId(subscription.id, {
      status: this.mapStripeStatus(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date()
    });

    logger.info('Subscription updated', { userId, subscriptionId: subscription.id });
  }

  private async handleSubscriptionCancellation(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;
    
    await this.db.subscriptions.updateByStripeId(subscription.id, {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date(),
      updatedAt: new Date()
    });

    // Downgrade to free plan
    await this.createSubscription(userId, PricingTier.FREE);
    
    logger.info('Subscription cancelled', { userId, subscriptionId: subscription.id });
  }

  private async handlePaymentSuccess(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoice.subscription as string;
    
    await this.db.subscriptions.updateByStripeId(subscriptionId, {
      status: SubscriptionStatus.ACTIVE,
      updatedAt: new Date()
    });

    logger.info('Payment succeeded', { subscriptionId, invoiceId: invoice.id });
  }

  private async handlePaymentFailure(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoice.subscription as string;
    
    await this.db.subscriptions.updateByStripeId(subscriptionId, {
      status: SubscriptionStatus.PAST_DUE,
      updatedAt: new Date()
    });

    logger.warn('Payment failed', { subscriptionId, invoiceId: invoice.id });
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'incomplete': SubscriptionStatus.INCOMPLETE,
      'incomplete_expired': SubscriptionStatus.CANCELLED,
      'trialing': SubscriptionStatus.TRIALING,
      'active': SubscriptionStatus.ACTIVE,
      'past_due': SubscriptionStatus.PAST_DUE,
      'canceled': SubscriptionStatus.CANCELLED,
      'unpaid': SubscriptionStatus.PAST_DUE
    };

    return statusMap[stripeStatus] || SubscriptionStatus.INCOMPLETE;
  }

  private async calculateStorageUsage(userId: string): Promise<number> {
    // Calculate storage usage in GB
    const totalBytes = await this.db.analyses.calculateStorageByUser(userId);
    return totalBytes / (1024 * 1024 * 1024); // Convert to GB
  }
}
