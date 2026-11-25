import { BankOutlined, LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Divider, Form, Input, List, Modal, Row, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { roleNames } from '../api/labels'
import type { UserInfo, UserRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { PageTitle } from '../components/common'

const DEMO_PASSWORD = 'Demo123!'

// Демо-облікові записи (db/CivicBudget_demo.sql) — клік підставляє логін і пароль
const demoAccounts = [
  { email: 'admin@civicbudget.test', role: 'Адміністратор', note: 'з 2FA' },
  { email: 'moderator@civicbudget.test', role: 'Модератор' },
  { email: 'expert@civicbudget.test', role: 'Експерт' },
  { email: 'operator@civicbudget.test', role: 'Оператор' },
  { email: 'executor@civicbudget.test', role: 'Виконавець' },
  { email: 'author@civicbudget.test', role: 'Автор' },
  { email: 'resident@civicbudget.test', role: 'Мешканець' },
  { email: 'teen@civicbudget.test', role: '15 років' },
]

/** Куди перейти після входу — головна сторінка ролі. */
export function homeFor(user: UserInfo): string {
  const r = user.roles
  if (r.includes('admin')) return '/admin/campaign'
  if (r.includes('moderator')) return '/moderation'
  if (r.includes('expert')) return '/expertise'
  if (r.includes('operator')) return '/operator'
  if (r.includes('executor')) return '/executor'
  return '/voting'
}

export function LoginPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { login, verifyCode, loginBankId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [form] = Form.useForm<{ email: string; password: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<{ id: string; message: string; devHint: string | null } | null>(null)
  const [code, setCode] = useState('')
  const [bankOpen, setBankOpen] = useState(false)
  const [bankUsers, setBankUsers] = useState<UserRow[] | null>(null)

  const done = (user: UserInfo) => {
    message.success(t('Вітаємо, {{name}}!', { name: user.fullName }))
    navigate(from ?? homeFor(user), { replace: true })
  }

  const submit = async (v: { email: string; password: string }) => {
    setBusy(true)
    setError(null)
    try {
      const step = await login(v.email, v.password)
      if (step.kind === 'done') done(step.user)
      else {
        setChallenge({ id: step.challengeId, message: step.message, devHint: step.devHint })
        setCode('')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (value = code) => {
    if (!challenge || value.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      done(await verifyCode(challenge.id, value))
    } catch (e) {
      setError((e as Error).message)
      setCode('')
      if ((e as Error).message.includes('Увійдіть ще раз')) setChallenge(null)
    } finally {
      setBusy(false)
    }
  }

  const openBank = async () => {
    setBankOpen(true)
    if (!bankUsers) setBankUsers(await api<UserRow[]>('/api/auth/bankid-demo/users'))
  }

  const bankLogin = async (userId: number) => {
    try {
      done(await loginBankId(userId))
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Row justify="center" gutter={[24, 24]}>
      <Col xs={24} md={14} lg={10}>
        <Card>
          {!challenge ? (
            <>
              <PageTitle title={t('Вхід')} subtitle={t('Увійдіть, щоб подавати проєкти й голосувати')} help="login" />
              {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
              <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
                <Form.Item
                  name="email"
                  label="E-mail"
                  rules={[{ required: true, message: t('Вкажіть e-mail.') }]}
                  tooltip={t('E-mail, вказаний під час реєстрації')}
                >
                  <Input prefix={<MailOutlined />} autoComplete="username" size="large" />
                </Form.Item>
                <Form.Item name="password" label={t('Пароль')} rules={[{ required: true, message: t('Вкажіть пароль.') }]}>
                  <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={busy}>
                  {t('Увійти')}
                </Button>
              </Form>
              <Divider plain>{t('або')}</Divider>
              <Button block size="large" icon={<BankOutlined />} onClick={() => void openBank()}>
                {t('Увійти через BankID (демо)')}
              </Button>
              <Typography.Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
                {t('Ще немає облікового запису?')} <Link to="/register">{t('Зареєструватися')}</Link>
              </Typography.Paragraph>
            </>
          ) : (
            <>
              <PageTitle title={t('Підтвердження входу')} help="login" />
              <Alert type="info" showIcon icon={<SafetyOutlined />} message={t(challenge.message)} style={{ marginBottom: 12 }} />
              {challenge.devHint && (
                <Alert
                  type="warning"
                  showIcon
                  message={t('Демо-режим: справжньої пошти немає')}
                  description={
                    <>
                      {t('Лист із кодом записано файлом .eml у папку')}{' '}
                      <Typography.Text code copyable style={{ wordBreak: 'break-all' }}>
                        {challenge.devHint.replace(/^.*папку\s+/, '')}
                      </Typography.Text>
                      . {t('Відкрийте найновіший файл блокнотом.')}
                    </>
                  }
                  style={{ marginBottom: 16 }}
                />
              )}
              {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
              <Typography.Paragraph>{t('Введіть 6-значний код із листа:')}</Typography.Paragraph>
              <Input.OTP
                length={6}
                value={code}
                onChange={(v) => {
                  setCode(v)
                  if (v.length === 6) void confirm(v)
                }}
                size="large"
                autoFocus
              />
              <Button type="primary" block size="large" style={{ marginTop: 20 }} loading={busy} onClick={() => void confirm()}>
                {t('Підтвердити')}
              </Button>
              <Button type="link" block onClick={() => setChallenge(null)}>
                {t('Назад')}
              </Button>
            </>
          )}
        </Card>
      </Col>

      <Col xs={24} md={10} lg={8}>
        <Card title={t('Демо-облікові записи')} size="small">
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            {t('Пароль для всіх')}: <Typography.Text code>{DEMO_PASSWORD}</Typography.Text>. {t('Клік — підставити логін.')}
          </Typography.Paragraph>
          <List
            size="small"
            dataSource={demoAccounts}
            renderItem={(a) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setChallenge(null)
                  form.setFieldsValue({ email: a.email, password: DEMO_PASSWORD })
                }}
              >
                <span style={{ fontSize: 13 }}>{a.email}</span>
                <span>
                  <Tag>{t(a.role)}</Tag>
                  {a.note && <Tag color="gold">{a.note}</Tag>}
                </span>
              </List.Item>
            )}
          />
        </Card>
      </Col>

      <Modal open={bankOpen} onCancel={() => setBankOpen(false)} footer={null} title={t('BankID (демо): оберіть особу')}>
        <Alert
          type="info"
          showIcon
          message={t('Імітація: справжньої інтеграції з банком у курсовій немає. Оберіть, від чийого імені «увійти через банк».')}
          style={{ marginBottom: 12 }}
        />
        <List
          loading={!bankUsers}
          dataSource={bankUsers ?? []}
          style={{ maxHeight: 420, overflow: 'auto' }}
          renderItem={(u) => (
            <List.Item
              actions={[
                <Button key="in" type="link" onClick={() => void bankLogin(u.userId)}>
                  {t('Увійти')}
                </Button>,
              ]}
            >
              <List.Item.Meta title={u.fullName} description={u.roles.map((r) => t(roleNames[r] ?? r)).join(', ')} />
            </List.Item>
          )}
        />
      </Modal>
    </Row>
  )
}
