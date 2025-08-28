import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import type { AuthStackParamList } from '@/types'

// Auth screens
import LoginScreen from '@/screens/auth/LoginScreen'
import SignupScreen from '@/screens/auth/SignupScreen'
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen'
import ResetPasswordScreen from '@/screens/auth/ResetPasswordScreen'
import BiometricSetupScreen from '@/screens/auth/BiometricSetupScreen'

const AuthStack = createStackNavigator<AuthStackParamList>()

export default function AuthNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerStyle: {
          backgroundColor: '#ffffff',
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        headerTintColor: '#333333',
        cardStyle: {
          backgroundColor: '#ffffff',
        },
      }}
    >
      <AuthStack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{
          headerShown: false,
        }}
      />
      <AuthStack.Screen 
        name="Signup" 
        component={SignupScreen}
        options={{
          title: 'Create Account',
          headerBackTitleVisible: false,
        }}
      />
      <AuthStack.Screen 
        name="ForgotPassword" 
        component={ForgotPasswordScreen}
        options={{
          title: 'Reset Password',
          headerBackTitleVisible: false,
        }}
      />
      <AuthStack.Screen 
        name="ResetPassword" 
        component={ResetPasswordScreen}
        options={{
          title: 'New Password',
          headerBackTitleVisible: false,
          headerLeft: () => null, // Prevent back navigation
        }}
      />
      <AuthStack.Screen 
        name="BiometricSetup" 
        component={BiometricSetupScreen}
        options={{
          title: 'Biometric Setup',
          headerBackTitleVisible: false,
        }}
      />
    </AuthStack.Navigator>
  )
}