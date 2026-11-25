import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, loadAuth, onAuthChanged, saveAuth } from '../api/client'
import type { AuthResponse, UserInfo } from '../api/types'

interface AuthState {
  user: UserInfo | null
  hasRole: (...roles: string[]) => boolean
  login: (email: string, password: string) => Promise<UserInfo>
  loginBankId: (userId: number) => Promise<UserInfo>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => loadAuth()?.user ?? null)

  useEffect(() => {
    onAuthChanged((auth) => setUser(auth?.user ?? null))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } })
    saveAuth(res)
    return res.user
  }, [])

  const loginBankId = useCallback(async (userId: number) => {
    const res = await api<AuthResponse>('/api/auth/bankid-demo', { method: 'POST', body: { userId } })
    saveAuth(res)
    return res.user
  }, [])

  const logout = useCallback(() => saveAuth(null), [])

  const hasRole = useCallback(
    (...roles: string[]) => !!user && roles.some((r) => user.roles.includes(r)),
    [user],
  )

  return (
    <AuthContext.Provider value={{ user, hasRole, login, loginBankId, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth поза AuthProvider')
  return ctx
}
