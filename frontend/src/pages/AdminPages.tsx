import {
  CrownOutlined,
  LockOutlined,
  MoreOutlined,
  PlusOutlined,
  SafetyOutlined,
  SaveOutlined,
  TeamOutlined,
  TrophyFilled,
  UnlockOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, query } from '../api/client'
import {
  auditActions,
  campaignStatus,
  campaignStatusOrder,
  formatDate,
  formatDateTime,
  formatMoney,
  methodNames,
  projectStatus,
  roleNames,
  verificationNames,
} from '../api/labels'
import type {
  AuditRow,
  Campaign,
  PagedResult,
  RatingResponse,
  References,
  StageTransitionCheck,
  Statistics,
  UserRow,
} from '../api/types'
import { RatingView } from '../components/RatingView'
import { CampaignTag, ExportButton, LoadState, PageTitle, useLoad } from '../components/common'

/** Вибір кампанії для адмін-сторінок (за замовчуванням — поточна). */
function useCampaigns() {
  const list = useLoad(async () => {
    const all = await api<Campaign[]>('/api/campaigns')
    const current = await api<Campaign>('/api/campaigns/current').catch(() => null)
    return { all, current }
  }, [])
  const [id, setId] = useState<number | undefined>()
  const selected = id ?? list.data?.current?.campaignId ?? list.data?.all[0]?.campaignId
  return { list, selected, setId }
}

function CampaignSelect({
  campaigns,
  value,
  onChange,
}: {
  campaigns: Campaign[]
  value?: number
  onChange: (v: number) => void
}) {
  const { t } = useTranslation()
  return (
    <Select
      style={{ minWidth: 230 }}
      value={value}
      onChange={onChange}
      options={campaigns.map((c) => ({
        value: c.campaignId,
        label: `${c.name} · ${t(campaignStatus[c.status])}`,
      }))}
      aria-label={t('Кампанія')}
    />
  )
}

// ======================= Кампанія =======================

interface CampaignForm {
  campaignYear: number
  name: string
  totalBudget: number
  minProjectCost: number
  maxProjectCost: number
  votesPerVoter: number
  maxVotesPerProject: number
  maxProjectsPerAuthor: number
  minVoterAge: number
  submission: [Dayjs, Dayjs]
  reviewEnd: Dayjs
  voting: [Dayjs, Dayjs]
  resultsDate: Dayjs
  showInterimResults: boolean
  limits: Record<string, number | null>
}

const toForm = (c: Campaign): CampaignForm => ({
  campaignYear: c.campaignYear,
  name: c.name,
  totalBudget: c.totalBudget,
  minProjectCost: c.minProjectCost,
  maxProjectCost: c.maxProjectCost,
  votesPerVoter: c.votesPerVoter,
  maxVotesPerProject: c.maxVotesPerProject,
  maxProjectsPerAuthor: c.maxProjectsPerAuthor,
  minVoterAge: c.minVoterAge,
  submission: [dayjs(c.submissionStart), dayjs(c.submissionEnd)],
  reviewEnd: dayjs(c.reviewEnd),
  voting: [dayjs(c.votingStart), dayjs(c.votingEnd)],
  resultsDate: dayjs(c.resultsDate),
  showInterimResults: c.showInterimResults,
  limits: Object.fromEntries(c.categories.map((x) => [String(x.categoryId), x.budgetLimit])),
})

const fromForm = (v: CampaignForm) => {
  const d = (x: Dayjs) => x.format('YYYY-MM-DD')
  return {
    campaignYear: v.campaignYear,
    name: v.name,
    totalBudget: v.totalBudget,
    minProjectCost: v.minProjectCost,
    maxProjectCost: v.maxProjectCost,
    votesPerVoter: v.votesPerVoter,
    maxVotesPerProject: v.maxVotesPerProject,
    maxProjectsPerAuthor: v.maxProjectsPerAuthor,
    minVoterAge: v.minVoterAge,
    submissionStart: d(v.submission[0]),
    submissionEnd: d(v.submission[1]),
    reviewEnd: d(v.reviewEnd),
    votingStart: d(v.voting[0]),
    votingEnd: d(v.voting[1]),
    resultsDate: d(v.resultsDate),
    showInterimResults: v.showInterimResults,
    categories: Object.entries(v.limits ?? {})
      .filter(([, l]) => l != null && l > 0)
      .map(([id, l]) => ({ categoryId: Number(id), budgetLimit: l })),
  }
}

export function AdminCampaignPage() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const { list, selected, setId } = useCampaigns()
  const refs = useLoad(() => api<References>('/api/reference'), [])
  const campaign = useLoad(
    () => (selected ? api<Campaign>(`/api/campaigns/${selected}`) : Promise.resolve(null)),
    [selected],
  )
  const [form] = Form.useForm<CampaignForm>()
  const [saving, setSaving] = useState(false)
  const [rating, setRating] = useState<RatingResponse | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [creating, setCreating] = useState(false)
  const c = campaign.data

  useEffect(() => {
    if (c) form.setFieldsValue(toForm(c))
  }, [c, form])

  // рейтинг береться з БД для будь-якої кампанії після завершення голосування — не зникає після оновлення сторінки
  const ratingAvailable = !!c && ['counting', 'implementation', 'closed'].includes(c.status)
  useEffect(() => {
    setRating(null)
    if (!c || !ratingAvailable) return
    api<RatingResponse>(`/api/admin/campaigns/${c.campaignId}/rating`)
      .then(setRating)
      .catch(() => undefined)
  }, [c, ratingAvailable])

  const save = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v || !c) return
    setSaving(true)
    try {
      await api(`/api/admin/campaigns/${c.campaignId}`, { method: 'PUT', body: fromForm(v) })
      message.success(t('Параметри кампанії збережено'))
      void campaign.reload()
      void list.reload()
    } catch (e) {
      message.error((e as Error).message, 6)
    } finally {
      setSaving(false)
    }
  }

  // Перед перемиканням сервер каже, чи можна (лише по черзі, назад — не після підрахунку), що станеться і що не завершено.
  const setStatus = async (status: string) => {
    let check: StageTransitionCheck
    try {
      check = await api<StageTransitionCheck>(
        `/api/admin/campaigns/${c!.campaignId}/status-check${query({ to: status })}`,
      )
    } catch (e) {
      message.error((e as Error).message)
      return
    }
    const title = `${t(campaignStatus[c!.status])} → ${t(campaignStatus[status])}`
    if (!check.allowed) {
      modal.info({ title, content: t(check.blocker ?? ''), okText: t('Зрозуміло') })
      return
    }
    modal.confirm({
      title: `${t('Перемкнути етап?')} ${title}`,
      width: 520,
      content: (
        <>
          <ul style={{ paddingInlineStart: 18, margin: '8px 0' }}>
            {check.consequences.map((x) => (
              <li key={x}>{t(x)}</li>
            ))}
          </ul>
          {check.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={t('Зверніть увагу')}
              description={
                <ul style={{ paddingInlineStart: 18, margin: 0 }}>
                  {check.warnings.map((x) => (
                    <li key={x}>{t(x)}</li>
                  ))}
                </ul>
              }
            />
          )}
        </>
      ),
      okText: t('Перемкнути'),
      cancelText: t('Скасувати'),
      onOk: async () => {
        try {
          await api(`/api/admin/campaigns/${c!.campaignId}/status`, { method: 'POST', body: { status } })
          message.success(t('Етап кампанії змінено'))
          void campaign.reload()
          void list.reload()
        } catch (e) {
          message.error((e as Error).message)
        }
      },
    })
  }

  // «Визначити переможців» — збережена процедура usp_SelectWinners (ADO.NET, SqlDataReader)
  const confirmSelectWinners = () =>
    modal.confirm({
      title: t('Визначити переможців?'),
      width: 520,
      content: t(
        'Голоси буде підраховано, проєкти в кожній категорії відібрано за рейтингом у межах ліміту. Переможці й автори отримають сповіщення, кампанія перейде на етап «Реалізація». Скасувати це не можна.',
      ),
      okText: t('Визначити переможців'),
      cancelText: t('Скасувати'),
      onOk: () => selectWinners(),
    })

  const selectWinners = async () => {
    setSelecting(true)
    try {
      setRating(
        await api<RatingResponse>(`/api/admin/campaigns/${c!.campaignId}/select-winners`, { method: 'POST' }),
      )
      message.success(t('Переможців визначено'))
      void campaign.reload()
      void list.reload()
    } catch (e) {
      message.error((e as Error).message, 6)
    } finally {
      setSelecting(false)
    }
  }

  const create = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    try {
      const r = await api<{ campaignId: number }>('/api/admin/campaigns', {
        method: 'POST',
        body: fromForm(v),
      })
      message.success(t('Кампанію створено'))
      setCreating(false)
      await list.reload()
      setId(r.campaignId)
    } catch (e) {
      message.error((e as Error).message, 6)
    }
  }

  const startCreate = () => {
    const y = (list.data?.all[0]?.campaignYear ?? dayjs().year()) + 1
    const base = c ? toForm(c) : undefined
    const shift = (d: Dayjs) => d.year(y)
    form.setFieldsValue({
      ...(base ?? {}),
      campaignYear: y,
      name: `Громадський бюджет ${y}`,
      submission: base ? [shift(base.submission[0]), shift(base.submission[1])] : undefined,
      reviewEnd: base ? shift(base.reviewEnd) : undefined,
      voting: base ? [shift(base.voting[0]), shift(base.voting[1])] : undefined,
      resultsDate: base ? shift(base.resultsDate) : undefined,
    } as CampaignForm)
    setCreating(true)
    setRating(null)
  }

  const statusIdx = c ? campaignStatusOrder.indexOf(c.status) : 0

  return (
    <>
      <PageTitle
        title={creating ? t('Нова кампанія') : t('Кампанія')}
        subtitle={t('Параметри, строки етапів, ліміти категорій, перемикання етапів, визначення переможців')}
        help="adminCampaign"
        extra={
          !creating && (
            <>
              {list.data && <CampaignSelect campaigns={list.data.all} value={selected} onChange={setId} />}
              <Button icon={<PlusOutlined />} onClick={startCreate}>
                {t('Нова кампанія')}
              </Button>
            </>
          )
        }
      />
      <LoadState loading={campaign.loading && !c} error={campaign.error ?? list.error}>
        {c && (
          <>
            {!creating && (
              <Card
                style={{ marginBottom: 24 }}
                title={
                  <Space>
                    {t('Етап кампанії')} <CampaignTag status={c.status} />
                  </Space>
                }
              >
                <Steps
                  current={statusIdx}
                  size="small"
                  responsive
                  onChange={(i) => i !== statusIdx && void setStatus(campaignStatusOrder[i])}
                  items={campaignStatusOrder.map((s) => ({ title: t(campaignStatus[s]) }))}
                />
                <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
                  {t(
                    'Етапи перемикаються по черзі. До підрахунку голосів можна повернутися на крок назад, після — ні.',
                  )}
                </Typography.Paragraph>
                <Divider />
                <Flex gap={16} align="center" wrap>
                  <Button
                    type="primary"
                    size="large"
                    icon={<CrownOutlined />}
                    loading={selecting}
                    disabled={c.status !== 'counting'}
                    onClick={confirmSelectWinners}
                  >
                    {t('Визначити переможців')}
                  </Button>
                  <Typography.Text type="secondary">
                    {c.status === 'counting'
                      ? t('Проєкти буде відібрано за кількістю голосів у межах ліміту кожної категорії.')
                      : t('Доступно на етапі «Підрахунок голосів».')}
                  </Typography.Text>
                </Flex>
              </Card>
            )}

            {rating && !creating && (
              <Card
                title={
                  <Space>
                    <TrophyFilled style={{ color: '#b8860b' }} />
                    {rating.final ? t('Рейтинг і переможці') : t('Попередній рейтинг')}
                  </Space>
                }
                extra={
                  rating.final && (
                    <ExportButton
                      path={`/api/reports/winners?campaignId=${c.campaignId}`}
                      label="Перелік переможців"
                    />
                  )
                }
                style={{ marginBottom: 24 }}
              >
                <RatingView rating={rating} />
              </Card>
            )}

            <Form form={form} layout="vertical" requiredMark={false}>
              <Row gutter={[24, 0]}>
                <Col xs={24} lg={14}>
                  <Card title={t('Параметри кампанії')} style={{ marginBottom: 24 }}>
                    <Row gutter={16}>
                      <Col xs={24} sm={16}>
                        <Form.Item
                          name="name"
                          label={t('Назва')}
                          rules={[{ required: true, message: t('Вкажіть назву кампанії.') }]}
                        >
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="campaignYear" label={t('Рік')} rules={[{ required: true }]}>
                          <InputNumber min={2000} max={2100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          name="totalBudget"
                          label={t('Загальний бюджет, грн')}
                          rules={[{ required: true }]}
                        >
                          <InputNumber min={1} step={100000} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={8}>
                        <Form.Item
                          name="minProjectCost"
                          label={t('Мін. вартість, грн')}
                          rules={[{ required: true }]}
                        >
                          <InputNumber min={1} step={10000} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={8}>
                        <Form.Item
                          name="maxProjectCost"
                          label={t('Макс. вартість, грн')}
                          rules={[{ required: true }]}
                        >
                          <InputNumber min={1} step={50000} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Divider orientation="left" plain>
                      {t('Строки етапів')}
                    </Divider>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          name="submission"
                          label={t('Подання проєктів')}
                          rules={[{ required: true }]}
                        >
                          <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="reviewEnd" label={t('Розгляд — до')} rules={[{ required: true }]}>
                          <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="voting" label={t('Голосування')} rules={[{ required: true }]}>
                          <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          name="resultsDate"
                          label={t('Оголошення результатів')}
                          rules={[{ required: true }]}
                        >
                          <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Divider orientation="left" plain>
                      {t('Правила голосування')}
                    </Divider>
                    <Row gutter={16}>
                      <Col xs={12} sm={6}>
                        <Form.Item
                          name="votesPerVoter"
                          label={t('Голосів у виборця')}
                          tooltip={t('За ТЗ — 5')}
                        >
                          <InputNumber min={1} max={50} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item
                          name="maxVotesPerProject"
                          label={t('За один проєкт')}
                          tooltip={t('За ТЗ — не більше 2')}
                        >
                          <InputNumber min={1} max={50} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item name="minVoterAge" label={t('Вік з')} tooltip={t('За ТЗ — з 16 років')}>
                          <InputNumber min={14} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item name="maxProjectsPerAuthor" label={t('Проєктів на автора')}>
                          <InputNumber min={1} max={50} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      name="showInterimResults"
                      valuePropName="checked"
                      label={t('Показувати проміжні результати під час голосування')}
                    >
                      <Switch />
                    </Form.Item>
                  </Card>
                </Col>
                <Col xs={24} lg={10}>
                  <Card title={t('Ліміти категорій')} style={{ marginBottom: 24 }}>
                    <Typography.Paragraph type="secondary">
                      {t('Порожнє поле — категорія не відкрита в кампанії.')}
                    </Typography.Paragraph>
                    {(refs.data?.categories ?? []).map((cat) => (
                      <Form.Item
                        key={cat.id}
                        name={['limits', String(cat.id)]}
                        label={t(cat.name)}
                        style={{ marginBottom: 12 }}
                      >
                        <InputNumber min={0} step={50000} style={{ width: '100%' }} addonAfter={t('грн')} />
                      </Form.Item>
                    ))}
                  </Card>
                  <Flex gap={8}>
                    {creating ? (
                      <>
                        <Button
                          type="primary"
                          size="large"
                          icon={<PlusOutlined />}
                          onClick={() => void create()}
                        >
                          {t('Створити кампанію')}
                        </Button>
                        <Button
                          size="large"
                          onClick={() => {
                            setCreating(false)
                            form.setFieldsValue(toForm(c))
                          }}
                        >
                          {t('Скасувати')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="primary"
                        size="large"
                        icon={<SaveOutlined />}
                        loading={saving}
                        onClick={() => void save()}
                      >
                        {t('Зберегти параметри')}
                      </Button>
                    )}
                  </Flex>
                </Col>
              </Row>
            </Form>
          </>
        )}
      </LoadState>
    </>
  )
}

// ======================= Статистика =======================

const COLORS = [
  '#1f5c99',
  '#43a047',
  '#ef6c00',
  '#8e24aa',
  '#00838f',
  '#c62828',
  '#6d4c41',
  '#546e7a',
  '#d4a017',
  '#5c6bc0',
]

export function AdminStatisticsPage() {
  const { t } = useTranslation()
  const { list, selected, setId } = useCampaigns()
  const st = useLoad(
    () =>
      selected ? api<Statistics>(`/api/admin/statistics?campaignId=${selected}`) : Promise.resolve(null),
    [selected],
  )
  const s = st.data

  return (
    <>
      <PageTitle
        title={t('Статистика')}
        subtitle={t('Зведені показники кампанії')}
        help="adminStatistics"
        extra={
          <>
            {list.data && <CampaignSelect campaigns={list.data.all} value={selected} onChange={setId} />}
            {selected && <ExportButton path={`/api/reports/statistics?campaignId=${selected}`} />}
          </>
        }
      />
      <LoadState loading={st.loading && !s} error={st.error}>
        {s && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              {[
                {
                  title: t('Користувачів'),
                  value: s.summary.users,
                  suffix: `/ ${s.summary.verifiedUsers} ${t('верифік.')}`,
                },
                {
                  title: t('Проєктів'),
                  value: s.summary.projects,
                  suffix: `/ ${s.summary.publishedProjects} ${t('опублік.')}`,
                },
                { title: t('Виборців'), value: s.summary.voters },
                {
                  title: t('Голосів'),
                  value: s.summary.votes,
                  suffix: `(${s.summary.paperVotes} ${t('папір.')})`,
                },
              ].map((x) => (
                <Col xs={12} lg={6} key={x.title}>
                  <Card>
                    <Statistic
                      title={x.title}
                      value={x.value}
                      suffix={<span style={{ fontSize: 14 }}>{x.suffix}</span>}
                    />
                  </Card>
                </Col>
              ))}
            </Row>

            <Row gutter={[24, 24]}>
              <Col xs={24} lg={14}>
                <Card title={t('Голоси та проєкти за категоріями')}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={s.byCategory.map((c) => ({ ...c, categoryName: t(c.categoryName) }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="categoryName" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="totalVotes" name={t('Голоси')} fill="#1f5c99" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="projectCount" name={t('Проєкти')} fill="#43a047" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={10}>
                <Card title={t('Способи голосування')}>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: t('Онлайн'), value: s.summary.onlineVotes },
                          { name: t('Паперові бюлетені'), value: s.summary.paperVotes },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={100}
                        label
                      >
                        <Cell fill="#1f5c99" />
                        <Cell fill="#ef6c00" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card title={t('Вартість проєктів і ліміти категорій, грн')}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={s.byCategory.map((c) => ({ ...c, categoryName: t(c.categoryName) }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="categoryName" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v: number) => `${v / 1000}k`} />
                      <Tooltip formatter={(v: number) => formatMoney(v)} />
                      <Legend />
                      <Bar
                        dataKey="totalCost"
                        name={t('Заявлена вартість')}
                        fill="#8e24aa"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar dataKey="budgetLimit" name={t('Ліміт')} fill="#b0bec5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={10}>
                <Card title={t('Проєкти за статусами')}>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={s.byStatus.map((x) => ({
                          name: t(projectStatus[x.status] ?? x.status),
                          value: x.count,
                        }))}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={100}
                        label
                      >
                        {s.byStatus.map((x, i) => (
                          <Cell key={x.status} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card title={t('Голоси за районами')}>
                  <ResponsiveContainer width="100%" height={Math.max(220, s.byDistrict.length * 34)}>
                    <BarChart
                      data={s.byDistrict.map((d) => ({ ...d, districtName: t(d.districtName) }))}
                      layout="vertical"
                      margin={{ left: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="districtName" width={120} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="totalVotes" name={t('Голоси')} fill="#00838f" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={10}>
                <Card title={t('Освоєння бюджету')}>
                  <Descriptions
                    column={1}
                    size="small"
                    items={[
                      { label: t('Бюджет кампанії'), children: formatMoney(s.campaign.totalBudget) },
                      { label: t('Вартість переможців'), children: formatMoney(s.budgetUsage.winnersCost) },
                      {
                        label: t('Карток реалізації'),
                        children: `${s.budgetUsage.implementations} (${t('завершено')}: ${s.budgetUsage.completed})`,
                      },
                      { label: t('План за картками'), children: formatMoney(s.budgetUsage.plannedBudget) },
                      { label: t('Фактично витрачено'), children: formatMoney(s.budgetUsage.actualCost) },
                    ]}
                  />
                  {s.budgetUsage.plannedBudget > 0 && (
                    <Statistic
                      style={{ marginTop: 12 }}
                      title={t('Освоєно від плану')}
                      value={(s.budgetUsage.actualCost / s.budgetUsage.plannedBudget) * 100}
                      precision={1}
                      suffix="%"
                    />
                  )}
                </Card>
              </Col>
            </Row>
          </>
        )}
      </LoadState>
    </>
  )
}

// ======================= Звіти =======================

export function AdminReportsPage() {
  const { t } = useTranslation()
  const { list, selected, setId } = useCampaigns()
  const refs = useLoad(() => api<References>('/api/reference'), [])
  const [projectNo, setProjectNo] = useState<number | null>(null)
  const [catalog, setCatalog] = useState<{
    categoryId?: number
    districtId?: number
    minCost?: number
    maxCost?: number
  }>({})
  const projects = useLoad(
    () =>
      selected
        ? api<PagedResult<{ projectId: number; regNumber: string; title: string }>>(
            `/api/projects?campaignId=${selected}&pageSize=100&sort=title`,
          )
        : Promise.resolve(null),
    [selected],
  )

  const group = (title: string, items: { name: string; note: string; action: React.ReactNode }[]) => (
    <Card title={t(title)} style={{ marginBottom: 24 }}>
      <List
        dataSource={items}
        renderItem={(i) => (
          <List.Item actions={[i.action]}>
            <List.Item.Meta title={t(i.name)} description={t(i.note)} />
          </List.Item>
        )}
      />
    </Card>
  )

  return (
    <>
      <PageTitle
        title={t('Звіти')}
        subtitle={t(
          'Експорт у PDF, Excel (XLSX) і CSV. У шапці — назва ІС, кампанія, дата формування і хто сформував.',
        )}
        help="reports"
        extra={list.data && <CampaignSelect campaigns={list.data.all} value={selected} onChange={setId} />}
      />
      {group('а) Вихідна інформація', [
        {
          name: 'Картка проєкту',
          note: 'Опис, кошторис, голоси, історія розгляду',
          action: (
            <Space key="p" wrap>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('Оберіть проєкт')}
                style={{ width: 280 }}
                value={projectNo ?? undefined}
                onChange={setProjectNo}
                options={(projects.data?.items ?? []).map((p) => ({
                  value: p.projectId,
                  label: `${p.regNumber} ${p.title}`,
                }))}
              />
              <ExportButton path={`/api/reports/project/${projectNo ?? 0}`} />
            </Space>
          ),
        },
        {
          name: 'Перелік переможців',
          note: 'Проєкти-переможці кампанії за категоріями',
          action: <ExportButton key="w" path={`/api/reports/winners${query({ campaignId: selected })}`} />,
        },
        {
          name: 'Хід реалізації',
          note: 'Картки реалізації: підрядник, план/факт, етапи',
          action: <ExportButton key="i" path="/api/reports/implementation" />,
        },
      ])}
      {group('б) Результати фільтрації', [
        {
          name: 'Каталог за фільтром',
          note: 'Умови фільтра потрапляють у шапку звіту',
          action: (
            <Space key="c" wrap>
              <Select
                allowClear
                placeholder={t('Категорія')}
                style={{ width: 150 }}
                onChange={(v) => setCatalog((x) => ({ ...x, categoryId: v }))}
                options={(refs.data?.categories ?? []).map((c) => ({ value: c.id, label: t(c.name) }))}
              />
              <Select
                allowClear
                placeholder={t('Район')}
                style={{ width: 160 }}
                onChange={(v) => setCatalog((x) => ({ ...x, districtId: v }))}
                options={(refs.data?.districts ?? []).map((c) => ({ value: c.id, label: t(c.name) }))}
              />
              <InputNumber
                placeholder={t('від, грн')}
                min={0}
                step={50000}
                onChange={(v) => setCatalog((x) => ({ ...x, minCost: v ?? undefined }))}
              />
              <InputNumber
                placeholder={t('до, грн')}
                min={0}
                step={50000}
                onChange={(v) => setCatalog((x) => ({ ...x, maxCost: v ?? undefined }))}
              />
              <ExportButton path={`/api/reports/catalog${query({ campaignId: selected, ...catalog })}`} />
            </Space>
          ),
        },
      ])}
      {group('в) Результати запитів', [
        {
          name: 'Результати голосування',
          note: 'Рейтинг за категоріями, голоси онлайн і паперові',
          action: <ExportButton key="r" path={`/api/reports/results${query({ campaignId: selected })}`} />,
        },
        {
          name: 'Зведена статистика',
          note: 'Учасники, проєкти, голоси, освоєння бюджету, розподіл за категоріями й районами',
          action: <ExportButton key="s" path={`/api/reports/statistics${query({ campaignId: selected })}`} />,
        },
      ])}
    </>
  )
}

// ======================= Користувачі й ролі =======================

export function AdminUsersPage() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const users = useLoad(
    () => api<PagedResult<UserRow>>(`/api/admin/users${query({ search, page, pageSize: 15 })}`),
    [search, page],
  )
  const refs = useLoad(() => api<References>('/api/reference'), [])
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [roles, setRoles] = useState<string[]>([])

  const act = async (fn: () => Promise<{ message: string }>) => {
    try {
      const r = await fn()
      message.success(r.message)
      void users.reload()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <>
      <PageTitle
        title={t('Користувачі й ролі')}
        subtitle={t('Призначення ролей (RBAC), блокування, двофакторна автентифікація')}
        help="adminUsers"
      />
      <Card>
        <Input.Search
          allowClear
          placeholder={t('Прізвище, ім’я або e-mail')}
          onSearch={(v) => {
            setPage(1)
            setSearch(v)
          }}
          style={{ maxWidth: 360, marginBottom: 16 }}
        />
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('Кожен перегляд списку записується в журнал аудиту як доступ до персональних даних.')}
        />
        <LoadState loading={users.loading && !users.data} error={users.error}>
          <Table
            rowKey="userId"
            dataSource={users.data?.items ?? []}
            scroll={{ x: 900 }}
            pagination={{
              current: page,
              pageSize: 15,
              total: users.data?.total,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: t('Користувач'),
                render: (_, u) => (
                  <>
                    <b>{u.fullName}</b>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                      {u.email ?? t('без e-mail (лише BankID)')}
                    </div>
                  </>
                ),
              },
              { title: t('Нар.'), dataIndex: 'birthDate', width: 110, render: (v: string) => formatDate(v) },
              {
                title: t('Верифікація'),
                width: 170,
                render: (_, u) => (
                  <Tag color={u.verificationStatus === 'verified' ? 'green' : 'orange'}>
                    {t(verificationNames[u.verificationStatus] ?? u.verificationStatus)}
                    {u.verificationMethod && ` · ${methodNames[u.verificationMethod]}`}
                  </Tag>
                ),
              },
              {
                title: t('Ролі'),
                render: (_, u) =>
                  u.roles.map((r) => (
                    <Tag key={r} color={r === 'admin' ? 'gold' : 'blue'}>
                      {t(roleNames[r] ?? r)}
                    </Tag>
                  )),
              },
              {
                title: t('Стан'),
                width: 120,
                render: (_, u) =>
                  u.isBlocked ? (
                    <Tag color="error">{t('Заблоковано')}</Tag>
                  ) : (
                    <Tag color="success">{t('Активний')}</Tag>
                  ),
              },
              {
                title: '',
                width: 60,
                render: (_, u) => (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'roles', icon: <TeamOutlined />, label: t('Змінити ролі') },
                        u.isBlocked
                          ? { key: 'unblock', icon: <UnlockOutlined />, label: t('Розблокувати') }
                          : { key: 'block', icon: <LockOutlined />, label: t('Заблокувати'), danger: true },
                        { key: '2fa-on', icon: <SafetyOutlined />, label: t('Увімкнути 2FA') },
                        {
                          key: '2fa-off',
                          icon: <SafetyOutlined />,
                          label: t('Вимкнути 2FA'),
                          // для модератора, експерта й адміністратора 2FA обов'язкова (ТЗ ч.2 п.3.3)
                          disabled: u.roles.some((x) => ['moderator', 'expert', 'admin'].includes(x)),
                        },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'roles') {
                          setEditing(u)
                          setRoles(u.roles)
                        }
                        if (key === 'block' || key === 'unblock')
                          modal.confirm({
                            title:
                              key === 'block'
                                ? t('Заблокувати користувача?')
                                : t('Розблокувати користувача?'),
                            content:
                              key === 'block'
                                ? `${u.fullName}. ${t('Користувач не зможе увійти в систему. Уже віддані голоси й подані проєкти лишаються.')}`
                                : `${u.fullName}. ${t('Користувач знову зможе входити в систему.')}`,
                            okText: key === 'block' ? t('Заблокувати') : t('Розблокувати'),
                            okButtonProps: { danger: key === 'block' },
                            cancelText: t('Скасувати'),
                            onOk: () =>
                              act(() =>
                                api(`/api/admin/users/${u.userId}/block`, {
                                  method: 'PUT',
                                  body: { isBlocked: key === 'block' },
                                }),
                              ),
                          })
                        if (key.startsWith('2fa'))
                          void act(() =>
                            api(`/api/admin/users/${u.userId}/two-factor`, {
                              method: 'PUT',
                              body: { enabled: key === '2fa-on' },
                            }),
                          )
                      },
                    }}
                  >
                    <Button size="small" icon={<MoreOutlined />} aria-label={t('Дії')} />
                  </Dropdown>
                ),
              },
            ]}
          />
        </LoadState>
      </Card>
      <Modal
        open={!!editing}
        title={`${t('Ролі')}: ${editing?.fullName}`}
        okText={t('Зберегти')}
        cancelText={t('Скасувати')}
        onCancel={() => setEditing(null)}
        onOk={async () => {
          await act(() =>
            api(`/api/admin/users/${editing!.userId}/roles`, { method: 'PUT', body: { roles } }),
          )
          setEditing(null)
        }}
      >
        <Checkbox.Group
          value={roles}
          onChange={(v) => setRoles(v as string[])}
          options={(refs.data?.roles ?? []).map((r) => ({
            value: r.code,
            label: t(roleNames[r.code] ?? r.name),
          }))}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        />
      </Modal>
    </>
  )
}

// ======================= Журнал аудиту =======================

export function AdminAuditPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<{
    from?: string
    to?: string
    user?: string
    action?: string
    entity?: string
  }>({})
  const [page, setPage] = useState(1)
  const values = useLoad(() => api<{ actions: string[]; entities: string[] }>('/api/admin/audit/filters'), [])
  const audit = useLoad(
    () => api<PagedResult<AuditRow>>(`/api/admin/audit${query({ ...filter, page, pageSize: 20 })}`),
    [filter, page],
  )
  const set = (patch: Partial<typeof filter>) => {
    setPage(1)
    setFilter((f) => ({ ...f, ...patch }))
  }

  return (
    <>
      <PageTitle
        title={t('Журнал аудиту')}
        subtitle={t('Хто, що і коли змінював у системі')}
        help="adminAudit"
      />
      <Card style={{ marginBottom: 16 }}>
        <Flex gap={12} wrap>
          <DatePicker.RangePicker
            format="DD.MM.YYYY"
            onChange={(r) => set({ from: r?.[0]?.format('YYYY-MM-DD'), to: r?.[1]?.format('YYYY-MM-DD') })}
            placeholder={[t('Період з'), t('по')]}
          />
          <Input.Search
            allowClear
            placeholder={t('Користувач')}
            onSearch={(v) => set({ user: v || undefined })}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder={t('Дія користувача')}
            style={{ width: 260 }}
            onChange={(v) => set({ action: v })}
            options={(values.data?.actions ?? []).map((a) => ({ value: a, label: t(auditActions[a] ?? a) }))}
          />
          <Select
            allowClear
            placeholder={t('Об’єкт')}
            style={{ width: 200 }}
            onChange={(v) => set({ entity: v })}
            options={(values.data?.entities ?? []).map((e) => ({ value: e, label: e }))}
          />
        </Flex>
      </Card>
      <Card>
        <LoadState loading={audit.loading && !audit.data} error={audit.error}>
          <Table
            rowKey="auditId"
            size="small"
            dataSource={audit.data?.items ?? []}
            scroll={{ x: 900 }}
            locale={{ emptyText: <Empty description={t('Записів не знайдено')} /> }}
            pagination={{
              current: page,
              pageSize: 20,
              total: audit.data?.total,
              onChange: setPage,
              showSizeChanger: false,
              showTotal: (n) => `${t('Усього')}: ${n}`,
            }}
            columns={[
              {
                title: t('Час'),
                dataIndex: 'createdAt',
                width: 150,
                render: (v: string) => formatDateTime(v),
              },
              {
                title: t('Користувач'),
                dataIndex: 'userName',
                width: 180,
                render: (v: string | null) => v ?? <Tag>{t('система')}</Tag>,
              },
              {
                title: t('Дія'),
                dataIndex: 'actionCode',
                width: 220,
                render: (v: string) => t(auditActions[v] ?? v),
              },
              {
                title: t('Об’єкт'),
                width: 150,
                render: (_, r) => `${r.entityName}${r.entityId ? ' #' + r.entityId : ''}`,
              },
              { title: t('Деталі'), dataIndex: 'details' },
              { title: 'IP', dataIndex: 'ipAddress', width: 110 },
            ]}
          />
        </LoadState>
      </Card>
    </>
  )
}
