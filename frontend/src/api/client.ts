import type { AuthResponse } from './types'

// HTTP-клієнт: додає JWT, при 401 один раз оновлює токени через refresh-токен,
// помилки сервера ({message}) перетворює на ApiError з українським текстом.

const STORAGE_KEY = 'civic-budget-auth'

export class ApiError extends Error {
  status: number
  code: number

  constructor(message: string, status: number, code = 0) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function loadAuth(): AuthResponse | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as AuthResponse) : null
}

type AuthListener = (auth: AuthResponse | null) => void
let listener: AuthListener | null = null

export function onAuthChanged(fn: AuthListener) {
  listener = fn
}

export function saveAuth(auth: AuthResponse | null) {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
  else localStorage.removeItem(STORAGE_KEY)
  listener?.(auth)
}

let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const auth = loadAuth()
  if (!auth) return false
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      })
      if (!res.ok) {
        saveAuth(null)
        return false
      }
      saveAuth((await res.json()) as AuthResponse)
      return true
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  retry = true,
): Promise<T> {
  const auth = loadAuth()
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) headers.Authorization = `Bearer ${auth.accessToken}`

  let res: Response
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError('Сервер недоступний. Перевірте, що бекенд запущено.', 0)
  }

  if (res.status === 401 && auth && retry) {
    if (await tryRefresh()) return api<T>(path, options, false)
    throw new ApiError('Сесія завершилась. Увійдіть знову.', 401)
  }

  if (!res.ok) {
    let message = 'Сталася помилка. Спробуйте ще раз.'
    let code = 0
    try {
      const data = await res.json()
      if (data?.message) message = data.message
      else if (data?.title) message = data.title
      code = data?.code ?? 0
    } catch {
      /* відповідь без тіла */
    }
    if (res.status === 401) message = 'Потрібно увійти в систему.'
    if (res.status === 403 && message.startsWith('Сталася')) message = 'Недостатньо прав для цієї дії.'
    throw new ApiError(message, res.status, code)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Рядок запиту з об'єкта; порожні значення пропускаються. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
