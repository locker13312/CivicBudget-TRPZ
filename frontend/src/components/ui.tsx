import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { campaignStatus, projectStatus } from '../api/labels'
import type { References } from '../api/types'

/** Завантаження даних з API зі станами «завантаження» та «помилка». */
// eslint-disable-next-line react-refresh/only-export-components
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!path) return
    try {
      setLoading(true)
      setData(await api<T>(path))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}

let refsCache: Promise<References> | null = null
// eslint-disable-next-line react-refresh/only-export-components
export function useReferences() {
  const [refs, setRefs] = useState<References | null>(null)
  useEffect(() => {
    refsCache ??= api<References>('/api/reference')
    refsCache.then(setRefs).catch(() => (refsCache = null))
  }, [])
  return refs
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge st-${status}`}>{projectStatus[status] ?? status}</span>
}

export function CampaignBadge({ status }: { status: string }) {
  return <span className={`badge cst-${status}`}>{campaignStatus[status] ?? status}</span>
}

export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success' | 'info'
  children: ReactNode
}) {
  if (!children) return null
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Loading() {
  return <div className="loading">Завантаження…</div>
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Сторінки">
      <button className="btn btn-light" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Назад
      </button>
      <span>
        Сторінка {page} з {pages}
      </span>
      <button className="btn btn-light" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Далі →
      </button>
    </nav>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
