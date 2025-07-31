export enum PricingTier {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

export enum SubscriptionStatus {
  INCOMPLETE = 'incomplete',
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  UNPAID = 'unpaid'
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly'
}

export interface SubscriptionFeatures {
  analysesPerMonth: number; // -1 for unlimited
  repositoriesLimit: number; // -1 for unlimited
  teamMembers: number; // -1 for unlimited
  supportLevel: 'community' | 'email' | 'priority' | 'dedicated';
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  apiAccess: boolean;
  realtimeCollaboration: boolean;
  advancedSecurity: boolean;
}

export interface SubscriptionLimits {
  maxFileSize: number; // in bytes
  maxBatchSize: number;
  rateLimitPerHour: number; // -1 for unlimited
  storageGB: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number; // in USD
  billingCycle: BillingCycle;
  stripeProductId?: string;
  stripePriceId?: string;
  features: SubscriptionFeatures;
  limits: SubscriptionLimits;
  popular?: boolean;
  discount?: {
    percentage: number;
    validUntil: Date;
  };
}

export interface UserSubscription {
  id: string;
  userId: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  planId: PricingTier;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date;
  trialEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageMetrics {
  analysesThisMonth: number;
  activeRepositories: number;
  teamMembers: number;
  storageUsedGB: number;
  apiCallsThisMonth: number;
}

export interface BillingHistory {
  id: string;
  userId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  paidAt?: Date;
  createdAt: Date;
}

export interface PaymentMethod {
  id: string;
  userId: string;
  stripePaymentMethodId: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt: Date;
}

// GitHub Integration Types
export interface GitHubRepository {
  id: string;
  githubId: number;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  defaultBranch: string;
  language?: string;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  pushedAt: Date;
  owner: {
    login: string;
    avatarUrl: string;
    type: 'User' | 'Organization';
  };
}

export interface GitHubInstallation {
  id: string;
  userId: string;
  githubInstallationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  permissions: Record<string, string>;
  repositorySelection: 'all' | 'selected';
  selectedRepositories?: GitHubRepository[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PullRequestAnalysis {
  id: string;
  repositoryId: string;
  pullRequestNumber: number;
  githubPullRequestId: number;
  title: string;
  description?: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  overallScore?: number;
  issues: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Mobile App Types
export interface MobileSession {
  id: string;
  userId: string;
  deviceId: string;
  deviceType: 'ios' | 'android';
  appVersion: string;
  pushToken?: string;
  lastActiveAt: Date;
  createdAt: Date;
}

export interface PushNotification {
  id: string;
  userId: string;
  type: 'analysis_complete' | 'pr_review' | 'security_alert' | 'quota_warning';
  title: string;
  body: string;
  data?: Record<string, any>;
  sent: boolean;
  sentAt?: Date;
  createdAt: Date;
}

// Pricing Comparison with CodeRabbit
export interface CompetitorComparison {
  feature: string;
  ourPlan: string;
  codeRabbit: string;
  advantage: 'better' | 'same' | 'worse';
}

export const CODERABBIT_COMPARISON: CompetitorComparison[] = [
  {
    feature: 'Starter Plan Price',
    ourPlan: '$8/month',
    codeRabbit: '$12/month',
    advantage: 'better'
  },
  {
    feature: 'Professional Plan Price',
    ourPlan: '$20/month',
    codeRabbit: '$30/month',
    advantage: 'better'
  },
  {
    feature: 'Enterprise Plan Price',
    ourPlan: '$50/month',
    codeRabbit: '$80/month',
    advantage: 'better'
  },
  {
    feature: 'Mobile App',
    ourPlan: 'Full-featured iOS/Android app',
    codeRabbit: 'Web only',
    advantage: 'better'
  },
  {
    feature: 'Real-time Collaboration',
    ourPlan: 'Included in Starter+',
    codeRabbit: 'Professional+ only',
    advantage: 'better'
  },
  {
    feature: 'API Access',
    ourPlan: 'Included in Starter+',
    codeRabbit: 'Professional+ only',
    advantage: 'better'
  },
  {
    feature: 'Free Plan Analyses',
    ourPlan: '50/month',
    codeRabbit: '20/month',
    advantage: 'better'
  },
  {
    feature: 'Language Support',
    ourPlan: '15+ languages',
    codeRabbit: '10+ languages',
    advantage: 'better'
  }
];
