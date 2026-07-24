import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { NotificationPreferences, SessionUser } from './types'
import {
  registerAccount,
  resetPassword,
  signIn,
  signOut,
  subscribeToSession,
  updateAccountProfile,
} from './lib/auth'

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  signIn: typeof signIn
  register: (displayName: string, email: string, password: string) => Promise<void>
  signOut: typeof signOut
  resetPassword: typeof resetPassword
  updateProfile: (
    displayName: string,
    avatarDataUrl?: string,
    notificationPreferences?: NotificationPreferences,
  ) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      subscribeToSession((nextUser) => {
        setUser(nextUser)
        setLoading(false)
      }),
    [],
  )

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    const profile = await registerAccount(displayName, email, password)
    setUser(profile)
  }, [])

  const updateProfile = useCallback(async (
    displayName: string,
    avatarDataUrl?: string,
    notificationPreferences?: NotificationPreferences,
  ) => {
    if (!user) throw new Error('Devi accedere per modificare il profilo.')
    const profile = await updateAccountProfile(
      user,
      displayName,
      avatarDataUrl,
      notificationPreferences,
    )
    setUser(profile)
  }, [user])

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut, resetPassword, updateProfile }),
    [user, loading, register, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook intentionally lives beside its provider to keep the auth boundary self-contained.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve essere usato dentro AuthProvider.')
  return context
}
