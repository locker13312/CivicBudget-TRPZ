import { Button, Result } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { AppLayout } from './components/AppLayout'
import { HelpProvider } from './components/help'
import { AdminAuditPage, AdminCampaignPage, AdminStatisticsPage, AdminUsersPage } from './pages/AdminPages'
import { CatalogPage } from './pages/CatalogPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MyProjectsPage } from './pages/MyProjectsPage'
import { OperatorPage } from './pages/OperatorPage'
import { ProjectFormPage } from './pages/ProjectFormPage'
import { ProjectPage } from './pages/ProjectPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResultsPage } from './pages/ResultsPage'
import { ExpertisePage, ModerationPage, NotificationsPage } from './pages/StaffPages'
import { VotingPage } from './pages/VotingPage'

/** Сторінки, ще не переписані на Ant Design, показуються зі старими стилями MVP. */
const Legacy = ({ children }: { children: ReactNode }) => <div className="legacy">{children}</div>

function NotFound() {
  const { t } = useTranslation()
  return (
    <Result
      status="404"
      title={t('Сторінку не знайдено')}
      extra={
        <Link to="/">
          <Button type="primary">{t('На головну')}</Button>
        </Link>
      }
    />
  )
}

/** Маршрут з перевіркою ролі. */
const guard = (element: ReactNode, roles?: string[]) => <RequireRole roles={roles}>{element}</RequireRole>

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <HelpProvider>
          <Routes>
            <Route element={<AppLayout />}>
              {/* публічна частина (відвідувач без входу) */}
              <Route index element={<HomePage />} />
              <Route path="projects" element={<CatalogPage />} />
              <Route path="projects/:id" element={<ProjectPage />} />
              <Route path="results" element={<ResultsPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />

              {/* будь-який користувач після входу */}
              <Route path="notifications" element={guard(<Legacy><NotificationsPage /></Legacy>)} />

              {/* мешканець / автор */}
              <Route path="voting" element={guard(<Legacy><VotingPage /></Legacy>, ['resident'])} />
              <Route path="my/projects" element={guard(<Legacy><MyProjectsPage /></Legacy>, ['resident'])} />
              <Route path="my/projects/:id" element={guard(<Legacy><ProjectFormPage /></Legacy>, ['resident'])} />

              {/* працівники */}
              <Route path="moderation" element={guard(<Legacy><ModerationPage /></Legacy>, ['moderator'])} />
              <Route path="expertise" element={guard(<Legacy><ExpertisePage /></Legacy>, ['expert'])} />
              <Route path="operator" element={guard(<Legacy><OperatorPage /></Legacy>, ['operator'])} />

              {/* адміністратор */}
              <Route path="admin/campaign" element={guard(<Legacy><AdminCampaignPage /></Legacy>, ['admin'])} />
              <Route path="admin/users" element={guard(<Legacy><AdminUsersPage /></Legacy>, ['admin'])} />
              <Route path="admin/audit" element={guard(<Legacy><AdminAuditPage /></Legacy>, ['admin'])} />
              <Route path="admin/statistics" element={guard(<Legacy><AdminStatisticsPage /></Legacy>, ['admin'])} />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HelpProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
