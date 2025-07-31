import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';
import { useQuery } from 'react-query';

// Components
import Card from '../../components/common/Card';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import MetricCard from '../../components/dashboard/MetricCard';
import RecentAnalysisItem from '../../components/dashboard/RecentAnalysisItem';
import QuickActionButton from '../../components/dashboard/QuickActionButton';

// Services
import { DashboardService } from '../../services/DashboardService';
import { AnalysisService } from '../../services/AnalysisService';

// Hooks
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';

// Types
import { DashboardData, RecentAnalysis } from '../../types/dashboard';

const { width: screenWidth } = Dimensions.get('window');
const chartWidth = screenWidth - 40;

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch dashboard data
  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useQuery<DashboardData>(
    ['dashboard', user?.id],
    () => DashboardService.getDashboardData(),
    {
      enabled: !!user,
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  );

  // Fetch recent analyses
  const {
    data: recentAnalyses,
    isLoading: analysesLoading,
  } = useQuery<RecentAnalysis[]>(
    ['recentAnalyses', user?.id],
    () => AnalysisService.getRecentAnalyses(5),
    {
      enabled: !!user,
      staleTime: 1 * 60 * 1000, // 1 minute
    }
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch()]);
    setRefreshing(false);
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'analyze':
        navigation.navigate('CodeEditor');
        break;
      case 'repositories':
        navigation.navigate('Repositories');
        break;
      case 'pullrequests':
        navigation.navigate('PullRequests');
        break;
      case 'subscription':
        navigation.navigate('Subscription');
        break;
    }
  };

  if (isLoading && !dashboardData) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <LoadingSpinner size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ErrorMessage 
          message="Failed to load dashboard data" 
          onRetry={refetch}
        />
      </View>
    );
  }

  const chartConfig = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${theme.isDark ? '255, 255, 255' : '0, 0, 0'}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(${theme.isDark ? '255, 255, 255' : '0, 0, 0'}, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: theme.colors.primary,
    },
  };

  const issueDistributionData = [
    {
      name: 'Critical',
      population: dashboardData?.issueDistribution.critical || 0,
      color: '#FF6B6B',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
    {
      name: 'High',
      population: dashboardData?.issueDistribution.high || 0,
      color: '#FF9F43',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
    {
      name: 'Medium',
      population: dashboardData?.issueDistribution.medium || 0,
      color: '#FFC048',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
    {
      name: 'Low',
      population: dashboardData?.issueDistribution.low || 0,
      color: '#26DE81',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
  ];

  const analysisHistoryData = {
    labels: dashboardData?.analysisHistory.map(item => item.date) || [],
    datasets: [
      {
        data: dashboardData?.analysisHistory.map(item => item.count) || [],
        color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`,
        strokeWidth: 2,
      },
    ],
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: theme.colors.textSecondary }]}>
            Good {getTimeOfDay()},
          </Text>
          <Text style={[styles.userName, { color: theme.colors.text }]}>
            {user?.name || 'Developer'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.profileButton, { backgroundColor: theme.colors.surface }]}
          onPress={() => navigation.navigate('Profile')}
        >
          <Ionicons name="person" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Quick Actions
        </Text>
        <View style={styles.quickActions}>
          <QuickActionButton
            icon="code-slash"
            title="Analyze Code"
            onPress={() => handleQuickAction('analyze')}
          />
          <QuickActionButton
            icon="folder"
            title="Repositories"
            onPress={() => handleQuickAction('repositories')}
          />
          <QuickActionButton
            icon="git-pull-request"
            title="Pull Requests"
            onPress={() => handleQuickAction('pullrequests')}
          />
          <QuickActionButton
            icon="card"
            title="Subscription"
            onPress={() => handleQuickAction('subscription')}
          />
        </View>
      </View>

      {/* Metrics Overview */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Overview
        </Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            title="Analyses This Month"
            value={dashboardData?.metrics.analysesThisMonth || 0}
            icon="analytics"
            color={theme.colors.primary}
          />
          <MetricCard
            title="Active Repositories"
            value={dashboardData?.metrics.activeRepositories || 0}
            icon="folder"
            color="#26DE81"
          />
          <MetricCard
            title="Issues Found"
            value={dashboardData?.metrics.totalIssues || 0}
            icon="warning"
            color="#FF6B6B"
          />
          <MetricCard
            title="Code Quality"
            value={`${dashboardData?.metrics.averageQuality || 0}/10`}
            icon="star"
            color="#FFC048"
          />
        </View>
      </View>

      {/* Analysis History Chart */}
      {dashboardData?.analysisHistory && dashboardData.analysisHistory.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Analysis History
          </Text>
          <Card style={styles.chartCard}>
            <LineChart
              data={analysisHistoryData}
              width={chartWidth - 32}
              height={200}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
            />
          </Card>
        </View>
      )}

      {/* Issue Distribution */}
      {issueDistributionData.some(item => item.population > 0) && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Issue Distribution
          </Text>
          <Card style={styles.chartCard}>
            <PieChart
              data={issueDistributionData}
              width={chartWidth - 32}
              height={200}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="15"
              style={styles.chart}
            />
          </Card>
        </View>
      )}

      {/* Recent Analyses */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Recent Analyses
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Analysis')}>
            <Text style={[styles.seeAllText, { color: theme.colors.primary }]}>
              See All
            </Text>
          </TouchableOpacity>
        </View>
        
        {analysesLoading ? (
          <LoadingSpinner />
        ) : recentAnalyses && recentAnalyses.length > 0 ? (
          <View style={styles.recentAnalyses}>
            {recentAnalyses.map((analysis) => (
              <RecentAnalysisItem
                key={analysis.id}
                analysis={analysis}
                onPress={() => navigation.navigate('AnalysisDetail', { id: analysis.id })}
              />
            ))}
          </View>
        ) : (
          <Card style={styles.emptyState}>
            <Ionicons 
              name="code-slash-outline" 
              size={48} 
              color={theme.colors.textSecondary} 
            />
            <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
              No analyses yet
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
              Start by analyzing your first piece of code
            </Text>
          </Card>
        )}
      </View>

      {/* Subscription Status */}
      {dashboardData?.subscription && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Subscription
          </Text>
          <Card style={styles.subscriptionCard}>
            <View style={styles.subscriptionHeader}>
              <View>
                <Text style={[styles.subscriptionPlan, { color: theme.colors.text }]}>
                  {dashboardData.subscription.planName}
                </Text>
                <Text style={[styles.subscriptionStatus, { color: theme.colors.textSecondary }]}>
                  {dashboardData.subscription.status}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.upgradeButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => navigation.navigate('Subscription')}
              >
                <Text style={[styles.upgradeButtonText, { color: 'white' }]}>
                  Manage
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.usageBar}>
              <View style={styles.usageInfo}>
                <Text style={[styles.usageText, { color: theme.colors.textSecondary }]}>
                  {dashboardData.subscription.usage.current} / {dashboardData.subscription.usage.limit} analyses used
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: theme.colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: theme.colors.primary,
                      width: `${(dashboardData.subscription.usage.current / dashboardData.subscription.usage.limit) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </Card>
        </View>
      )}

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const getTimeOfDay = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  greeting: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  userName: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    marginTop: 4,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  seeAllText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  chartCard: {
    padding: 16,
    marginTop: 16,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  recentAnalyses: {
    marginTop: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
    textAlign: 'center',
  },
  subscriptionCard: {
    padding: 20,
    marginTop: 16,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  subscriptionPlan: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  subscriptionStatus: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  upgradeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  usageBar: {
    marginTop: 8,
  },
  usageInfo: {
    marginBottom: 8,
  },
  usageText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  bottomSpacing: {
    height: 20,
  },
});

export default DashboardScreen;
