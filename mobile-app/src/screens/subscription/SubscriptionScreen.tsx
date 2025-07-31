import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';

// Components
import Card from '../../components/common/Card';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import PricingCard from '../../components/subscription/PricingCard';
import FeatureComparison from '../../components/subscription/FeatureComparison';
import UsageChart from '../../components/subscription/UsageChart';

// Services
import { SubscriptionService } from '../../services/SubscriptionService';

// Hooks
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';

// Types
import { 
  SubscriptionPlan, 
  UserSubscription, 
  PricingTier, 
  BillingCycle,
  UsageMetrics 
} from '../../types/subscription';

const SubscriptionScreen: React.FC = () => {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<PricingTier | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(BillingCycle.MONTHLY);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Fetch current subscription
  const {
    data: currentSubscription,
    isLoading: subscriptionLoading,
    error: subscriptionError,
  } = useQuery<UserSubscription>(
    ['subscription', user?.id],
    () => SubscriptionService.getCurrentSubscription(),
    {
      enabled: !!user,
    }
  );

  // Fetch pricing plans
  const {
    data: pricingPlans,
    isLoading: plansLoading,
  } = useQuery<Record<PricingTier, SubscriptionPlan>>(
    'pricingPlans',
    () => SubscriptionService.getPricingPlans(),
    {
      staleTime: 10 * 60 * 1000, // 10 minutes
    }
  );

  // Fetch usage metrics
  const {
    data: usageMetrics,
    isLoading: usageLoading,
  } = useQuery<UsageMetrics>(
    ['usage', user?.id],
    () => SubscriptionService.getCurrentUsage(),
    {
      enabled: !!user,
    }
  );

  // Upgrade subscription mutation
  const upgradeMutation = useMutation(
    ({ planId, billingCycle }: { planId: PricingTier; billingCycle: BillingCycle }) =>
      SubscriptionService.upgradeSubscription(planId, billingCycle),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['subscription', user?.id]);
        queryClient.invalidateQueries(['usage', user?.id]);
        Alert.alert('Success', 'Your subscription has been updated successfully!');
        setIsUpgrading(false);
      },
      onError: (error: any) => {
        Alert.alert('Error', error.message || 'Failed to update subscription');
        setIsUpgrading(false);
      },
    }
  );

  const handleUpgrade = async (planId: PricingTier) => {
    if (!user || planId === currentSubscription?.planId) return;

    setIsUpgrading(true);
    setSelectedPlan(planId);

    try {
      if (planId === PricingTier.FREE) {
        // Downgrade to free
        await SubscriptionService.cancelSubscription();
        queryClient.invalidateQueries(['subscription', user.id]);
        Alert.alert('Success', 'Subscription cancelled. You\'ve been moved to the free plan.');
      } else {
        // Upgrade to paid plan
        upgradeMutation.mutate({ planId, billingCycle });
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update subscription');
    } finally {
      setIsUpgrading(false);
      setSelectedPlan(null);
    }
  };

  const handleBillingCycleChange = (cycle: BillingCycle) => {
    setBillingCycle(cycle);
  };

  const getDiscountPercentage = (plan: SubscriptionPlan): number => {
    if (billingCycle === BillingCycle.YEARLY) {
      return 20; // 20% discount for yearly billing
    }
    return 0;
  };

  const getEffectivePrice = (plan: SubscriptionPlan): number => {
    const basePrice = plan.price;
    if (billingCycle === BillingCycle.YEARLY) {
      return Math.round(basePrice * 12 * 0.8); // 20% discount
    }
    return basePrice;
  };

  if (subscriptionLoading || plansLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <LoadingSpinner size="large" />
      </View>
    );
  }

  if (subscriptionError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ErrorMessage 
          message="Failed to load subscription data" 
          onRetry={() => queryClient.invalidateQueries(['subscription', user?.id])}
        />
      </View>
    );
  }

  const currentPlan = pricingPlans?.[currentSubscription?.planId || PricingTier.FREE];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Current Subscription Status */}
      {currentSubscription && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Current Plan
          </Text>
          <Card style={styles.currentPlanCard}>
            <View style={styles.currentPlanHeader}>
              <View>
                <Text style={[styles.currentPlanName, { color: theme.colors.text }]}>
                  {currentPlan?.name}
                </Text>
                <Text style={[styles.currentPlanPrice, { color: theme.colors.textSecondary }]}>
                  ${currentPlan?.price}/month
                </Text>
              </View>
              <View style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(currentSubscription.status) }
              ]}>
                <Text style={styles.statusText}>
                  {currentSubscription.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Usage Progress */}
            {usageMetrics && currentPlan && (
              <View style={styles.usageSection}>
                <Text style={[styles.usageTitle, { color: theme.colors.text }]}>
                  Monthly Usage
                </Text>
                <View style={styles.usageItem}>
                  <Text style={[styles.usageLabel, { color: theme.colors.textSecondary }]}>
                    Analyses
                  </Text>
                  <Text style={[styles.usageValue, { color: theme.colors.text }]}>
                    {usageMetrics.analysesThisMonth} / {currentPlan.features.analysesPerMonth === -1 ? '∞' : currentPlan.features.analysesPerMonth}
                  </Text>
                </View>
                <View style={styles.usageItem}>
                  <Text style={[styles.usageLabel, { color: theme.colors.textSecondary }]}>
                    Repositories
                  </Text>
                  <Text style={[styles.usageValue, { color: theme.colors.text }]}>
                    {usageMetrics.activeRepositories} / {currentPlan.features.repositoriesLimit === -1 ? '∞' : currentPlan.features.repositoriesLimit}
                  </Text>
                </View>
                <View style={styles.usageItem}>
                  <Text style={[styles.usageLabel, { color: theme.colors.textSecondary }]}>
                    Storage
                  </Text>
                  <Text style={[styles.usageValue, { color: theme.colors.text }]}>
                    {usageMetrics.storageUsedGB.toFixed(1)} GB / {currentPlan.limits.storageGB} GB
                  </Text>
                </View>
              </View>
            )}
          </Card>
        </View>
      )}

      {/* Billing Cycle Toggle */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Choose Your Plan
        </Text>
        <View style={styles.billingToggle}>
          <TouchableOpacity
            style={[
              styles.billingOption,
              billingCycle === BillingCycle.MONTHLY && styles.billingOptionActive,
              { backgroundColor: billingCycle === BillingCycle.MONTHLY ? theme.colors.primary : theme.colors.surface }
            ]}
            onPress={() => handleBillingCycleChange(BillingCycle.MONTHLY)}
          >
            <Text style={[
              styles.billingOptionText,
              { color: billingCycle === BillingCycle.MONTHLY ? 'white' : theme.colors.text }
            ]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.billingOption,
              billingCycle === BillingCycle.YEARLY && styles.billingOptionActive,
              { backgroundColor: billingCycle === BillingCycle.YEARLY ? theme.colors.primary : theme.colors.surface }
            ]}
            onPress={() => handleBillingCycleChange(BillingCycle.YEARLY)}
          >
            <Text style={[
              styles.billingOptionText,
              { color: billingCycle === BillingCycle.YEARLY ? 'white' : theme.colors.text }
            ]}>
              Yearly
            </Text>
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>Save 20%</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Pricing Plans */}
      <View style={styles.section}>
        <View style={styles.pricingGrid}>
          {pricingPlans && Object.entries(pricingPlans).map(([tier, plan]) => (
            <PricingCard
              key={tier}
              plan={plan}
              tier={tier as PricingTier}
              billingCycle={billingCycle}
              effectivePrice={getEffectivePrice(plan)}
              discountPercentage={getDiscountPercentage(plan)}
              isCurrentPlan={tier === currentSubscription?.planId}
              isPopular={tier === PricingTier.PROFESSIONAL}
              isLoading={isUpgrading && selectedPlan === tier}
              onSelect={() => handleUpgrade(tier as PricingTier)}
            />
          ))}
        </View>
      </View>

      {/* Feature Comparison */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Feature Comparison
        </Text>
        {pricingPlans && (
          <FeatureComparison plans={pricingPlans} />
        )}
      </View>

      {/* Competitive Advantage */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Why Choose Us Over CodeRabbit?
        </Text>
        <Card style={styles.comparisonCard}>
          <View style={styles.comparisonItem}>
            <Ionicons name="checkmark-circle" size={24} color="#26DE81" />
            <View style={styles.comparisonText}>
              <Text style={[styles.comparisonTitle, { color: theme.colors.text }]}>
                Better Pricing
              </Text>
              <Text style={[styles.comparisonDescription, { color: theme.colors.textSecondary }]}>
                Up to 40% cheaper than CodeRabbit with more features included
              </Text>
            </View>
          </View>
          <View style={styles.comparisonItem}>
            <Ionicons name="phone-portrait" size={24} color="#26DE81" />
            <View style={styles.comparisonText}>
              <Text style={[styles.comparisonTitle, { color: theme.colors.text }]}>
                Mobile App
              </Text>
              <Text style={[styles.comparisonDescription, { color: theme.colors.textSecondary }]}>
                Full-featured iOS and Android app - CodeRabbit is web-only
              </Text>
            </View>
          </View>
          <View style={styles.comparisonItem}>
            <Ionicons name="flash" size={24} color="#26DE81" />
            <View style={styles.comparisonText}>
              <Text style={[styles.comparisonTitle, { color: theme.colors.text }]}>
                Real-time Collaboration
              </Text>
              <Text style={[styles.comparisonDescription, { color: theme.colors.textSecondary }]}>
                Available from Starter plan vs Professional+ only at CodeRabbit
              </Text>
            </View>
          </View>
          <View style={styles.comparisonItem}>
            <Ionicons name="code-slash" size={24} color="#26DE81" />
            <View style={styles.comparisonText}>
              <Text style={[styles.comparisonTitle, { color: theme.colors.text }]}>
                More Languages
              </Text>
              <Text style={[styles.comparisonDescription, { color: theme.colors.textSecondary }]}>
                Support for 15+ programming languages vs 10+ at CodeRabbit
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* FAQ Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Frequently Asked Questions
        </Text>
        <Card style={styles.faqCard}>
          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: theme.colors.text }]}>
              Can I change my plan anytime?
            </Text>
            <Text style={[styles.faqAnswer, { color: theme.colors.textSecondary }]}>
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
            </Text>
          </View>
          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: theme.colors.text }]}>
              What happens if I exceed my limits?
            </Text>
            <Text style={[styles.faqAnswer, { color: theme.colors.textSecondary }]}>
              You'll receive notifications when approaching limits. Upgrade anytime to continue using the service.
            </Text>
          </View>
          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: theme.colors.text }]}>
              Is there a free trial?
            </Text>
            <Text style={[styles.faqAnswer, { color: theme.colors.textSecondary }]}>
              Our free plan includes 50 analyses per month. No credit card required to get started.
            </Text>
          </View>
        </Card>
      </View>

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'active':
      return '#26DE81';
    case 'trialing':
      return '#FFC048';
    case 'past_due':
      return '#FF6B6B';
    case 'cancelled':
      return '#95A5A6';
    default:
      return '#95A5A6';
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
  },
  currentPlanCard: {
    padding: 20,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  currentPlanName: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
  },
  currentPlanPrice: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  usageSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 20,
  },
  usageTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  usageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  usageLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  usageValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  billingOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    position: 'relative',
  },
  billingOptionActive: {
    // Styles handled by backgroundColor prop
  },
  billingOptionText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  discountBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  discountText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
  pricingGrid: {
    gap: 16,
  },
  comparisonCard: {
    padding: 20,
  },
  comparisonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  comparisonText: {
    flex: 1,
    marginLeft: 12,
  },
  comparisonTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  comparisonDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  faqCard: {
    padding: 20,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqQuestion: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  bottomSpacing: {
    height: 20,
  },
});

export default SubscriptionScreen;
