import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { roleNames } from '../api/labels'
import { useAuth } from '../auth/AuthContext'

interface MenuItem {
  to: string
  label: string
  roles?: string[]
}

// Меню залежить від ролей користувача (RBAC)
const menu: MenuItem[] = [
  { to: '/', label: 'Головна' },
  { to: '/projects', label: 'Проєкти' },
  { to: '/results', label: 'Результати' },
  { to: '/voting', label: 'Голосування', roles: ['resident'] },
  { to: '/my/projects', label: 'Мої проєкти', roles: ['resident'] },
  { to: '/moderation', label: 'Модерація', roles: ['moderator'] },
  { to: '/expertise', label: 'Експертиза', roles: ['expert'] },
  { to: '/operator', label: 'Паперовий бюлетень', roles: ['operator'] },
  { to: '/admin/campaign', label: 'Кампанія', roles: ['admin'] },
  { to: '/admin/users', label: 'Користувачі', roles: ['admin'] },
  { to: '/admin/audit', label: 'Аудит', roles: ['admin'] },
  { to: '/admin/statistics', label: 'Статистика', roles: ['admin'] },
]

export function Layout() {
  const { user, hasRole, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    api<{ count: number }>('/api/notifications/unread-count')
      .then((r) => setUnread(r.count))
      .catch(() => undefined)
  }, [user, location.pathname])

  const items = menu.filter((m) => !m.roles || hasRole(...m.roles))

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <img src="/favicon.svg" alt="" width={30} height={30} />
            <span>
              Громадський бюджет
              <small>платформа міських ініціатив</small>
            </span>
          </Link>
          <div className="userbox">
            {user ? (
              <>
                <Link to="/notifications" className="bell" title="Сповіщення">
                  🔔{unread > 0 && <span className="bell-count">{unread}</span>}
                </Link>
                <div className="user-name">
                  {user.fullName}
                  <small>{user.roles.map((r) => roleNames[r] ?? r).join(', ')}</small>
                </div>
                <button
                  className="btn btn-light btn-sm"
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                >
                  Вийти
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">
                Увійти
              </Link>
            )}
          </div>
        </div>
        <nav className="mainnav">
          <div className="mainnav-inner">
            {items.map((m) => (
              <NavLink key={m.to} to={m.to} end={m.to === '/'}>
                {m.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        ІС «Громадський бюджет» · курсова робота з ТРПЗ · КПІ ім. Ігоря Сікорського, 2026
      </footer>
    </div>
  )
}
