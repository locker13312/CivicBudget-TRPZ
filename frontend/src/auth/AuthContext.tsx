import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, loadAuth, onAuthChanged, saveAuth } from '../api/client'
import type { AuthResponse, LoginResponse, UserInfo } from '../api/types'

/** Результат першого кроку входу: або користувач, або потрібен код 2FA. */
export type LoginStep =
  | { kind: 'done'; user: UserInfo }
  | { kind: 'twoFactor'; challengeId: string; message: string; devHint: string | null }

interface AuthState {
  user: UserInfo | null
  hasRole: (...roles: string[]) => boolean
  login: (email: string, password: string) => Promise<LoginStep>
  verifyCode: (challengeId: string, code: string) => Promise<UserInfo>
  loginBankId: (userId: number) => Promise<UserInfo>
  register: (personId: number, method: string, email: string, password: string) => Promise<UserInfo>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => loadAuth()?.user ?? null)

  useEffect(() => {
    onAuthChanged((auth) => setUser(auth?.user ?? null))
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<LoginStep> => {
    const res = await api<LoginResponse>('/api/auth/login', { method: 'POST', body: { email, password } })
    if (res.requiresTwoFactor)
      return {
        kind: 'twoFactor',
        challengeId: res.challengeId!,
        message: res.message ?? '',
        devHint: res.devHint,
      }
    const auth: AuthResponse = {
      accessToken: res.accessToken!,
      refreshToken: res.refreshToken!,
      accessExpiresAt: res.accessExpiresAt!,
      user: res.user!,
    }
    saveAuth(auth)
    return { kind: 'done', user: auth.user }
  }, [])

  const verifyCode = useCallback(async (challengeId: string, code: string) => {
    const res = await api<AuthResponse>('/api/auth/2fa', { method: 'POST', body: { challengeId, code } })
    saveAuth(res)
    return res.user
  }, [])

  const loginBankId = useCallback(async (userId: number) => {
    const res = await api<AuthResponse>('/api/auth/bankid-demo', { method: 'POST', body: { userId } })
    saveAuth(res)
    return res.user
  }, [])

  const register = useCallback(async (personId: number, method: string, email: string, password: string) => {
    const res = await api<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: { personId, method, email, password },
    })
    saveAuth(res)
    return res.user
  }, [])

  const logout = useCallback(() => saveAuth(null), [])

  const hasRole = useCallback(
    (...roles: string[]) => !!user && roles.some((r) => user.roles.includes(r)),
    [user],
  )

  return (
    <AuthContext.Provider value={{ user, hasRole, login, verifyCode, loginBankId, register, logout }}>
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
