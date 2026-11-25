import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { roleNames, verificationNames } from '../api/labels'
import type { UserInfo, UserRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Alert, Field } from '../components/ui'

const demoAccounts = [
  ['author@civicbudget.test', 'Автор (мешканець)'],
  ['resident@civicbudget.test', 'Мешканець'],
  ['moderator@civicbudget.test', 'Модератор'],
  ['expert@civicbudget.test', 'Експерт'],
  ['operator@civicbudget.test', 'Оператор'],
  ['admin@civicbudget.test', 'Адміністратор'],
  ['teen@civicbudget.test', 'Мешканець, 15 років'],
  ['unverified@civicbudget.test', 'Неверифікований'],
]

/** Стартова сторінка для кожної ролі після входу. */
function homeFor(user: UserInfo) {
  if (user.roles.includes('admin')) return '/admin/campaign'
  if (user.roles.includes('moderator')) return '/moderation'
  if (user.roles.includes('expert')) return '/expertise'
  if (user.roles.includes('operator')) return '/operator'
  return '/'
}

export function LoginPage() {
  const { login, loginBankId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bankUsers, setBankUsers] = useState<UserRow[] | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await login(email, password)
      navigate(from ?? homeFor(user))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function openBankId() {
    setError(null)
    try {
      setBankUsers(await api<UserRow[]>('/api/auth/bankid-demo/users'))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function bankIdLogin(userId: number) {
    try {
      const user = await loginBankId(userId)
      navigate(from ?? homeFor(user))
    } catch (err) {
      setError((err as Error).message)
      setBankUsers(null)
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>Вхід до системи</h1>
        <p className="muted">Увійдіть, щоб подавати проєкти, голосувати та отримувати сповіщення.</p>
        <Alert>{error}</Alert>
        <Field label="Електронна пошта">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          Увійти
        </button>
        <div className="or">або</div>
        <button type="button" className="btn btn-bankid btn-block" onClick={openBankId}>
          🏦 Увійти через BankID (демо)
        </button>
      </form>

      <aside className="card demo-accounts">
        <h2>Демо-облікові записи</h2>
        <p className="muted small">
          Пароль для всіх: <code>Demo123!</code>. Натисніть, щоб підставити.
        </p>
        <ul>
          {demoAccounts.map(([mail, title]) => (
            <li key={mail}>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setEmail(mail)
                  setPassword('Demo123!')
                }}
              >
                {title}
              </button>
              <small className="muted">{mail}</small>
            </li>
          ))}
        </ul>
      </aside>

      {bankUsers && (
        <div className="modal-backdrop" onClick={() => setBankUsers(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="BankID">
            <h2>BankID (демонстраційний режим)</h2>
            <p className="muted small">
              Справжньої інтеграції з банком немає. Оберіть особу, від імені якої банк «підтвердить» вхід.
            </p>
            <ul className="bank-list">
              {bankUsers.map((u) => (
                <li key={u.userId}>
                  <button className="bank-person" onClick={() => bankIdLogin(u.userId)}>
                    <b>{u.fullName}</b>
                    <small>
                      {u.roles.map((r) => roleNames[r] ?? r).join(', ')} ·{' '}
                      {verificationNames[u.verificationStatus]}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn btn-light" onClick={() => setBankUsers(null)}>
              Скасувати
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
