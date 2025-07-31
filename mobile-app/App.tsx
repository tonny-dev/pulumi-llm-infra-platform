import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ApolloProvider } from '@apollo/client';
import { QueryClient, QueryClientProvider } from 'react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

// Services
import { apolloClient } from './src/services/apollo';
import { NotificationService } from './src/services/NotificationService';
import { AuthService } from './src/services/AuthService';

// Screens
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import DashboardScreen from './src/screens/dashboard/DashboardScreen';
import RepositoriesScreen from './src/screens/repositories/RepositoriesScreen';
import RepositoryDetailScreen from './src/screens/repositories/RepositoryDetailScreen';
import AnalysisScreen from './src/screens/analysis/AnalysisScreen';
import AnalysisDetailScreen from './src/screens/analysis/AnalysisDetailScreen';
import CodeEditorScreen from './src/screens/code/CodeEditorScreen';
import PullRequestsScreen from './src/screens/pullrequests/PullRequestsScreen';
import PullRequestDetailScreen from './src/screens/pullrequests/PullRequestDetailScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import SubscriptionScreen from './src/screens/subscription/SubscriptionScreen';
import ProfileScreen from './src/screens/profile/ProfileScreen';

// Components
import LoadingScreen from './src/components/common/LoadingScreen';
import ErrorBoundary from './src/components/common/ErrorBoundary';

// Hooks
import { useAuthStore } from './src/stores/authStore';
import { useThemeStore } from './src/stores/themeStore';

// Types
import { RootStackParamList, TabParamList } from './src/types/navigation';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function TabNavigator() {
  const { theme } = useThemeStore();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'analytics' : 'analytics-outline';
              break;
            case 'Repositories':
              iconName = focused ? 'folder' : 'folder-outline';
              break;
            case 'Analysis':
              iconName = focused ? 'code-slash' : 'code-slash-outline';
              break;
            case 'PullRequests':
              iconName = focused ? 'git-pull-request' : 'git-pull-request-outline';
              break;
            case 'Settings':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            default:
              iconName = 'circle';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.text,
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen 
        name="Repositories" 
        component={RepositoriesScreen}
        options={{ title: 'Repositories' }}
      />
      <Tab.Screen 
        name="Analysis" 
        component={AnalysisScreen}
        options={{ title: 'Analysis' }}
      />
      <Tab.Screen 
        name="PullRequests" 
        component={PullRequestsScreen}
        options={{ title: 'Pull Requests' }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { isAuthenticated } = useAuthStore();
  const { theme } = useThemeStore();

  return (
    <NavigationContainer
      theme={{
        dark: theme.isDark,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.error,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.surface,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        {!isAuthenticated ? (
          // Auth Stack
          <>
            <Stack.Screen 
              name="Login" 
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="Register" 
              component={RegisterScreen}
              options={{ title: 'Create Account' }}
            />
          </>
        ) : (
          // Main App Stack
          <>
            <Stack.Screen 
              name="Main" 
              component={TabNavigator}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="RepositoryDetail" 
              component={RepositoryDetailScreen}
              options={{ title: 'Repository' }}
            />
            <Stack.Screen 
              name="AnalysisDetail" 
              component={AnalysisDetailScreen}
              options={{ title: 'Analysis Details' }}
            />
            <Stack.Screen 
              name="CodeEditor" 
              component={CodeEditorScreen}
              options={{ title: 'Code Editor' }}
            />
            <Stack.Screen 
              name="PullRequestDetail" 
              component={PullRequestDetailScreen}
              options={{ title: 'Pull Request' }}
            />
            <Stack.Screen 
              name="Subscription" 
              component={SubscriptionScreen}
              options={{ title: 'Subscription' }}
            />
            <Stack.Screen 
              name="Profile" 
              component={ProfileScreen}
              options={{ title: 'Profile' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const { initializeAuth } = useAuthStore();
  const { initializeTheme } = useThemeStore();

  useEffect(() => {
    async function prepare() {
      try {
        // Load fonts
        await Font.loadAsync({
          ...Ionicons.font,
          'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
          'Inter-Medium': require('./assets/fonts/Inter-Medium.ttf'),
          'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.ttf'),
          'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
          'FiraCode-Regular': require('./assets/fonts/FiraCode-Regular.ttf'),
        });

        // Initialize services
        await Promise.all([
          initializeAuth(),
          initializeTheme(),
          NotificationService.initialize(),
        ]);

        // Simulate loading time for better UX
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn('App initialization error:', e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, [initializeAuth, initializeTheme]);

  const onLayoutRootView = React.useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <SafeAreaProvider>
          <ApolloProvider client={apolloClient}>
            <QueryClientProvider client={queryClient}>
              <AppNavigator />
              <StatusBar style="auto" />
              <Toast />
            </QueryClientProvider>
          </ApolloProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
