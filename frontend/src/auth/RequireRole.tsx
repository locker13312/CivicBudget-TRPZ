import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/** Захищений маршрут: без входу — на сторінку входу, без потрібної ролі — повідомлення. */
export function RequireRole({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user, hasRole } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !hasRole(...roles))
    return (
      <div className="card">
        <h1>Доступ обмежено</h1>
        <p className="muted">Ця сторінка доступна лише для ролей: {roles.join(', ')}.</p>
      </div>
    )
  return <>{children}</>
}
