import { Button, Result } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { AppLayout } from './components/AppLayout'
import { HelpProvider } from './components/help'
import {
  AdminAuditPage,
  AdminCampaignPage,
  AdminReportsPage,
  AdminStatisticsPage,
  AdminUsersPage,
} from './pages/AdminPages'
import {
  AdminImplementationPage,
  ExecutorPage,
  ImplementationListPage,
  ImplementationPage,
} from './pages/ImplementationPages'
import { HelpPage, OpenDataPage } from './pages/InfoPages'
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
              <Route path="implementation" element={<ImplementationListPage />} />
              <Route path="implementation/:id" element={<ImplementationPage />} />
              <Route path="open-data" element={<OpenDataPage />} />
              <Route path="help" element={<HelpPage />} />

              {/* будь-який користувач після входу */}
              <Route path="notifications" element={guard(<NotificationsPage />)} />

              {/* мешканець / автор */}
              <Route path="voting" element={guard(<VotingPage />, ['resident'])} />
              <Route path="my/projects" element={guard(<MyProjectsPage />, ['resident'])} />
              <Route path="my/projects/:id" element={guard(<ProjectFormPage />, ['resident'])} />

              {/* працівники */}
              <Route path="moderation" element={guard(<ModerationPage />, ['moderator'])} />
              <Route path="expertise" element={guard(<ExpertisePage />, ['expert'])} />
              <Route path="operator" element={guard(<OperatorPage />, ['operator'])} />
              <Route path="executor" element={guard(<ExecutorPage />, ['executor'])} />

              {/* адміністратор */}
              <Route path="admin/campaign" element={guard(<AdminCampaignPage />, ['admin'])} />
              <Route path="admin/implementation" element={guard(<AdminImplementationPage />, ['admin'])} />
              <Route path="admin/reports" element={guard(<AdminReportsPage />, ['admin'])} />
              <Route path="admin/users" element={guard(<AdminUsersPage />, ['admin'])} />
              <Route path="admin/audit" element={guard(<AdminAuditPage />, ['admin'])} />
              <Route path="admin/statistics" element={guard(<AdminStatisticsPage />, ['admin'])} />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HelpProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
