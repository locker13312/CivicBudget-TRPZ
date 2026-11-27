import i18n from '../i18n'
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

async function send(
  path: string,
  options: { method?: string; body?: unknown },
  retry: boolean,
): Promise<Response> {
  const auth = loadAuth()
  const headers: Record<string, string> = {}
  const isForm = options.body instanceof FormData
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (auth) headers.Authorization = `Bearer ${auth.accessToken}`

  let res: Response
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: isForm
        ? (options.body as FormData)
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    })
  } catch {
    throw new ApiError(i18n.t('Немає зв’язку із сервером. Перевірте інтернет і спробуйте ще раз.'), 0)
  }

  if (res.status === 401 && auth && retry) {
    if (await tryRefresh()) return send(path, options, false)
    throw new ApiError(i18n.t('Сесія завершилась. Увійдіть знову.'), 401)
  }
  if (!res.ok) throw await toError(res)
  return res
}

async function toError(res: Response): Promise<ApiError> {
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
  // тексти помилок приходять з бекенду українською; в англійському інтерфейсі — переклад зі словника
  return new ApiError(i18n.t(message), res.status, code)
}

/** JSON-запит до API. body може бути об'єктом (JSON) або FormData (файли). */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await send(path, options, true)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Завантажити файл (звіт PDF/XLSX/CSV, вкладення) з токеном і зберегти на диск. */
export async function download(path: string, fallbackName = 'file') {
  const res = await send(path, {}, true)
  const disposition = res.headers.get('content-disposition') ?? ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  const name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Отримати файл як blob-URL (для перегляду непублічних фото з токеном). */
export async function blobUrl(path: string): Promise<string> {
  const res = await send(path, {}, true)
  return URL.createObjectURL(await res.blob())
}

/** Рядок запиту з об'єкта; порожні значення пропускаються. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
