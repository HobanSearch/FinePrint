import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StatusBar } from 'expo-status-bar'
import { Platform } from 'react-native'

// Navigation types
import type { RootStackParamList, MainTabParamList, AuthStackParamList } from '@/types'

// Screens
import SplashScreen from '@/screens/SplashScreen'
import OnboardingScreen from '@/screens/OnboardingScreen'
import AuthNavigator from './AuthNavigator'
import MainTabNavigator from './MainTabNavigator'
import DocumentDetailScreen from '@/screens/DocumentDetailScreen'
import AnalysisDetailScreen from '@/screens/AnalysisDetailScreen'
import SettingsScreen from '@/screens/SettingsScreen'
import ProfileScreen from '@/screens/ProfileScreen'

// Hooks and stores
import { useAuth } from '@/stores'
import { useEffect, useState } from 'react'

// Theme and styling
import { usePreferences } from '@/stores'
import { lightTheme, darkTheme } from '@/constants/theme'

const RootStack = createStackNavigator<RootStackParamList>()\n\ninterface AppNavigationProps {\n  onReady?: () => void\n}\n\nexport default function AppNavigation({ onReady }: AppNavigationProps) {\n  const { isAuthenticated, isLoading, checkAuthStatus } = useAuth()\n  const { preferences } = usePreferences()\n  const [isAppReady, setIsAppReady] = useState(false)\n\n  // Initialize app\n  useEffect(() => {\n    const initializeApp = async () => {\n      try {\n        await checkAuthStatus()\n      } catch (error) {\n        console.error('App initialization failed:', error)\n      } finally {\n        setIsAppReady(true)\n      }\n    }\n\n    initializeApp()\n  }, [])\n\n  // Get theme based on preferences\n  const getTheme = () => {\n    if (preferences.theme === 'system') {\n      // Use system theme detection\n      return lightTheme // For now, default to light\n    }\n    return preferences.theme === 'dark' ? darkTheme : lightTheme\n  }\n\n  const theme = getTheme()\n\n  // Show splash while app is loading\n  if (!isAppReady || isLoading) {\n    return (\n      <>\n        <SplashScreen />\n        <StatusBar style={theme.statusBar} />\n      </>\n    )\n  }\n\n  return (\n    <NavigationContainer\n      theme={theme.navigation}\n      onReady={onReady}\n    >\n      <RootStack.Navigator\n        screenOptions={{\n          headerShown: false,\n          gestureEnabled: Platform.OS === 'ios',\n          cardStyleInterpolator: Platform.OS === 'ios' \n            ? undefined \n            : ({ current, layouts }) => {\n                return {\n                  cardStyle: {\n                    transform: [\n                      {\n                        translateX: current.progress.interpolate({\n                          inputRange: [0, 1],\n                          outputRange: [layouts.screen.width, 0],\n                        }),\n                      },\n                    ],\n                  },\n                }\n              }\n        }}\n      >\n        {/* Show onboarding for first-time users */}\n        {!isAuthenticated && (\n          <>\n            <RootStack.Screen \n              name=\"Onboarding\" \n              component={OnboardingScreen}\n              options={{ animationEnabled: false }}\n            />\n            <RootStack.Screen \n              name=\"Auth\" \n              component={AuthNavigator}\n              options={{ animationEnabled: true }}\n            />\n          </>\n        )}\n        \n        {/* Main authenticated screens */}\n        {isAuthenticated && (\n          <>\n            <RootStack.Screen \n              name=\"Main\" \n              component={MainTabNavigator} \n              options={{ animationEnabled: false }}\n            />\n            <RootStack.Screen \n              name=\"DocumentDetail\" \n              component={DocumentDetailScreen}\n              options={{\n                presentation: 'modal',\n                headerShown: true,\n                title: 'Document Details'\n              }}\n            />\n            <RootStack.Screen \n              name=\"AnalysisDetail\" \n              component={AnalysisDetailScreen}\n              options={{\n                presentation: 'modal',\n                headerShown: true,\n                title: 'Analysis Results'\n              }}\n            />\n            <RootStack.Screen \n              name=\"Settings\" \n              component={SettingsScreen}\n              options={{\n                presentation: 'modal',\n                headerShown: true,\n                title: 'Settings'\n              }}\n            />\n            <RootStack.Screen \n              name=\"Profile\" \n              component={ProfileScreen}\n              options={{\n                presentation: 'modal',\n                headerShown: true,\n                title: 'Profile'\n              }}\n            />\n          </>\n        )}\n      </RootStack.Navigator>\n      \n      <StatusBar style={theme.statusBar} />\n    </NavigationContainer>\n  )\n}"