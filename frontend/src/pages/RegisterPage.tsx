import { BankOutlined, CheckCircleOutlined, IdcardOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  List,
  Modal,
  Row,
  Steps,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { formatDate } from '../api/labels'
import type { DemoPerson } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { PageTitle } from '../components/common'

function age(birth: string) {
  const b = new Date(birth)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--
  return a
}

/** Реєстрація мешканця з імітацією BankID / Дія.Підпис: дані особи «повертає банк», система перевіряє місто й вік. */
export function RegisterPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { register } = useAuth()
  const navigate = useNavigate()
  const [method, setMethod] = useState<'bankid' | 'diia' | null>(null)
  const [persons, setPersons] = useState<DemoPerson[] | null>(null)
  const [person, setPerson] = useState<DemoPerson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = async (m: 'bankid' | 'diia') => {
    setMethod(m)
    setError(null)
    if (!persons) setPersons(await api<DemoPerson[]>('/api/auth/identity-demo/persons'))
  }

  const submit = async (v: { email: string; password: string }) => {
    if (!person || !method) return
    setBusy(true)
    setError(null)
    try {
      await register(person.personId, method, v.email, v.password)
      message.success(t('Реєстрацію завершено. Ви увійшли в систему.'))
      navigate('/voting')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Row justify="center">
      <Col xs={24} md={18} lg={12}>
        <Card>
          <PageTitle
            title={t('Реєстрація')}
            subtitle={t(
              'Підтвердіть особу через BankID або Дія.Підпис — так система перевірить, що ви мешканець міста.',
            )}
            help="login"
          />
          <Steps
            size="small"
            current={person ? 1 : 0}
            items={[{ title: t('Підтвердження особи') }, { title: t('Дані для входу') }]}
            style={{ marginBottom: 24 }}
          />
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

          {!person ? (
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Button block size="large" icon={<BankOutlined />} onClick={() => void start('bankid')}>
                  BankID ({t('демо')})
                </Button>
              </Col>
              <Col xs={24} sm={12}>
                <Button
                  block
                  size="large"
                  icon={<IdcardOutlined />}
                  onClick={() => void start('diia')}
                  style={{ marginTop: 0 }}
                >
                  Дія.Підпис ({t('демо')})
                </Button>
              </Col>
            </Row>
          ) : (
            <>
              <Descriptions
                bordered
                size="small"
                column={1}
                title={
                  <span>
                    <CheckCircleOutlined style={{ color: '#2e7d32' }} /> {t('Дані від')}{' '}
                    {method === 'bankid' ? 'BankID' : 'Дія.Підпис'}
                  </span>
                }
                items={[
                  {
                    label: t('ПІБ'),
                    children: `${person.lastName} ${person.firstName} ${person.middleName}`,
                  },
                  {
                    label: t('Дата народження'),
                    children: `${formatDate(person.birthDate)} (${age(person.birthDate)} ${t('р.')})`,
                  },
                  { label: t('Адреса реєстрації'), children: person.regAddress },
                  { label: t('Район'), children: person.districtName },
                ]}
                style={{ marginBottom: 20 }}
              />
              <Form layout="vertical" onFinish={submit} requiredMark={false}>
                <Form.Item
                  name="email"
                  label="E-mail"
                  rules={[
                    { required: true, message: t('Вкажіть e-mail.') },
                    { type: 'email', message: t('Некоректний e-mail.') },
                  ]}
                >
                  <Input size="large" autoComplete="email" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label={t('Пароль')}
                  tooltip={t('Щонайменше 8 символів')}
                  rules={[
                    { required: true, message: t('Вкажіть пароль.') },
                    { min: 8, message: t('Пароль — щонайменше 8 символів.') },
                  ]}
                >
                  <Input.Password size="large" autoComplete="new-password" />
                </Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={busy}>
                  {t('Зареєструватися')}
                </Button>
                <Button type="link" block onClick={() => setPerson(null)}>
                  {t('Обрати іншу особу')}
                </Button>
              </Form>
            </>
          )}
        </Card>
      </Col>

      <Modal
        open={!!method && !person}
        onCancel={() => setMethod(null)}
        footer={null}
        title={`${method === 'diia' ? 'Дія.Підпис' : 'BankID'} (${t('демо')}): ${t('оберіть тестову особу')}`}
      >
        <Alert
          type="info"
          showIcon
          message={t(
            'Імітація: «банк» повертає дані тестової особи. Серед них є мешканець іншого міста й 13-річна особа — для показу відмов.',
          )}
          style={{ marginBottom: 12 }}
        />
        <List
          loading={!persons}
          dataSource={persons ?? []}
          renderItem={(p) => (
            <List.Item
              actions={[
                <Button key="pick" type="link" onClick={() => setPerson(p)}>
                  {t('Підтвердити')}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={`${p.lastName} ${p.firstName} ${p.middleName}`}
                description={
                  <>
                    {p.regAddress} · {age(p.birthDate)} {t('р.')}{' '}
                    {p.districtId == null && <Tag color="orange">{t('інше місто')}</Tag>}
                  </>
                }
              />
            </List.Item>
          )}
        />
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('У базі зберігається лише хеш РНОКПП, не сам номер.')}
        </Typography.Paragraph>
      </Modal>
    </Row>
  )
}
