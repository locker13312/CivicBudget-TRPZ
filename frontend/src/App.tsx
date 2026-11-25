import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { Layout } from './components/Layout'
import { AdminAuditPage, AdminCampaignPage, AdminStatisticsPage, AdminUsersPage } from './pages/AdminPages'
import { CatalogPage } from './pages/CatalogPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MyProjectsPage } from './pages/MyProjectsPage'
import { OperatorPage } from './pages/OperatorPage'
import { ProjectFormPage } from './pages/ProjectFormPage'
import { ProjectPage } from './pages/ProjectPage'
import { ResultsPage } from './pages/ResultsPage'
import { ExpertisePage, ModerationPage, NotificationsPage } from './pages/StaffPages'
import { VotingPage } from './pages/VotingPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* публічна частина (відвідувач без входу) */}
            <Route index element={<HomePage />} />
            <Route path="projects" element={<CatalogPage />} />
            <Route path="projects/:id" element={<ProjectPage />} />
            <Route path="results" element={<ResultsPage />} />
            <Route path="login" element={<LoginPage />} />

            {/* будь-який користувач після входу */}
            <Route
              path="notifications"
              element={
                <RequireRole>
                  <NotificationsPage />
                </RequireRole>
              }
            />

            {/* мешканець / автор */}
            <Route
              path="voting"
              element={
                <RequireRole roles={['resident']}>
                  <VotingPage />
                </RequireRole>
              }
            />
            <Route
              path="my/projects"
              element={
                <RequireRole roles={['resident']}>
                  <MyProjectsPage />
                </RequireRole>
              }
            />
            <Route
              path="my/projects/:id"
              element={
                <RequireRole roles={['resident']}>
                  <ProjectFormPage />
                </RequireRole>
              }
            />

            {/* працівники */}
            <Route
              path="moderation"
              element={
                <RequireRole roles={['moderator']}>
                  <ModerationPage />
                </RequireRole>
              }
            />
            <Route
              path="expertise"
              element={
                <RequireRole roles={['expert']}>
                  <ExpertisePage />
                </RequireRole>
              }
            />
            <Route
              path="operator"
              element={
                <RequireRole roles={['operator']}>
                  <OperatorPage />
                </RequireRole>
              }
            />

            {/* адміністратор */}
            <Route
              path="admin/campaign"
              element={
                <RequireRole roles={['admin']}>
                  <AdminCampaignPage />
                </RequireRole>
              }
            />
            <Route
              path="admin/users"
              element={
                <RequireRole roles={['admin']}>
                  <AdminUsersPage />
                </RequireRole>
              }
            />
            <Route
              path="admin/audit"
              element={
                <RequireRole roles={['admin']}>
                  <AdminAuditPage />
                </RequireRole>
              }
            />
            <Route
              path="admin/statistics"
              element={
                <RequireRole roles={['admin']}>
                  <AdminStatisticsPage />
                </RequireRole>
              }
            />

            <Route
              path="*"
              element={
                <div className="card">
                  <h1>Сторінку не знайдено</h1>
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
