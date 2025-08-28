import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api-client'
import { queryKeys } from '../../lib/query-client'
import { useStore } from '../../stores'

// Get user profile
export function useProfile() {
  const isAuthenticated = useStore(state => state.auth.isAuthenticated)
  
  return useQuery({
    queryKey: queryKeys.auth.profile(),
    queryFn: async () => {
      const response = await api.user.profile()
      return response.data
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  })
}

// Update user profile
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const setUser = useStore(state => state.auth.setUser)
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.user.updateProfile(data)
      return response.data
    },
    onSuccess: (data) => {
      // Update the profile cache
      queryClient.setQueryData(queryKeys.auth.profile(), data)
      
      // Update the store
      setUser(data)
      
      addNotification({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully'
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update profile'
      })
    }
  })
}

// Login mutation
export function useLogin() {
  const queryClient = useQueryClient()
  const login = useStore(state => state.auth.login)

  return useMutation({
    mutationFn: async ({ 
      email, 
      password, 
      rememberMe 
    }: { 
      email: string
      password: string
      rememberMe?: boolean 
    }) => {
      return await login(email, password, rememberMe)
    },
    onSuccess: () => {
      // Invalidate and refetch any user-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile() })
      queryClient.invalidateQueries({ queryKey: queryKeys.user.all() })
    }
  })
}

// Logout mutation
export function useLogout() {
  const queryClient = useQueryClient()
  const logout = useStore(state => state.auth.logout)

  return useMutation({
    mutationFn: async () => {
      return await logout()
    },
    onSuccess: () => {
      // Clear all cached data
      queryClient.clear()
    }
  })
}

// Signup mutation
export function useSignup() {
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async ({
      email,
      password,
      displayName
    }: {
      email: string
      password: string
      displayName?: string
    }) => {
      const response = await api.auth.signup(email, password, displayName)
      return response.data
    },
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Account Created',
        message: 'Please check your email to verify your account'
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Signup Failed',
        message: error.message || 'Failed to create account'
      })
    }
  })
}

// Change password mutation
export function useChangePassword() {
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword
    }: {
      currentPassword: string
      newPassword: string
    }) => {
      const response = await api.auth.changePassword(currentPassword, newPassword)
      return response.data
    },
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Password Changed',
        message: 'Your password has been updated successfully'
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Password Change Failed',
        message: error.message || 'Failed to change password'
      })
    }
  })
}

// Forgot password mutation
export function useForgotPassword() {
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async (email: string) => {
      const response = await api.auth.forgotPassword(email)
      return response.data
    },
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Reset Link Sent',
        message: 'Please check your email for password reset instructions'
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Reset Failed',
        message: error.message || 'Failed to send reset email'
      })
    }
  })
}

// Reset password mutation
export function useResetPassword() {
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async ({
      token,
      newPassword
    }: {
      token: string
      newPassword: string
    }) => {
      const response = await api.auth.resetPassword(token, newPassword)
      return response.data
    },
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Password Reset',
        message: 'Your password has been reset. You can now log in.'
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Reset Failed',
        message: error.message || 'Failed to reset password'
      })
    }
  })
}

// Get user sessions
export function useSessions() {
  const isAuthenticated = useStore(state => state.auth.isAuthenticated)

  return useQuery({
    queryKey: queryKeys.auth.sessions(),
    queryFn: async () => {
      const response = await api.user.sessions()
      return response.data
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000 // 2 minutes
  })
}

// Revoke sessions mutation
export function useRevokeSessions() {
  const queryClient = useQueryClient()
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const response = await api.user.revokeSessions(sessionIds)
      return response.data
    },
    onSuccess: () => {
      // Refresh sessions list
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })
      
      addNotification({
        type: 'success',
        title: 'Sessions Revoked',
        message: 'Selected sessions have been terminated'
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Revoke Failed',
        message: error.message || 'Failed to revoke sessions'
      })
    }
  })
}

// Delete account mutation
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  const logout = useStore(state => state.auth.logout)
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async () => {
      const response = await api.user.deleteAccount()
      return response.data
    },
    onSuccess: () => {
      // Clear all data and log out
      queryClient.clear()
      logout()
      
      addNotification({
        type: 'info',
        title: 'Account Deleted',
        message: 'Your account has been permanently deleted'
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Delete Failed',
        message: error.message || 'Failed to delete account'
      })
    }
  })
}