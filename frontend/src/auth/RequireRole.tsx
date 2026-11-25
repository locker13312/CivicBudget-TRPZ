import { Result } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router-dom'
import { roleNames } from '../api/labels'
import { useAuth } from './AuthContext'

/** Захищений маршрут: без входу — на сторінку входу, без потрібної ролі — повідомлення. */
export function RequireRole({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { t } = useTranslation()
  const { user, hasRole } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !hasRole(...roles))
    return (
      <Result
        status="403"
        title={t('Доступ обмежено')}
        subTitle={`${t('Ця сторінка доступна лише для ролей')}: ${roles.map((r) => t(roleNames[r] ?? r)).join(', ')}.`}
      />
    )
  return <>{children}</>
}
