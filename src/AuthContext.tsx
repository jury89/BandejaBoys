import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessionUser } from './types'
import {
  registerAccount,
  resetPassword,
  signIn,
  signOut,
  subscribeToSession,
} from './lib/auth'

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  signIn: typeof signIn
  register: (displayName: string, email: string, password: string) => Promise<void>
  signOut: typeof signOut
  resetPassword: typeof resetPassword
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

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut, resetPassword }),
    [user, loading, register],
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
