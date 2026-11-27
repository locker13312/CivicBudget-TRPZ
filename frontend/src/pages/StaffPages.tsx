import {
  AuditOutlined,
  CheckOutlined,
  EyeOutlined,
  MoreOutlined,
  NotificationOutlined,
  SendOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import {
  addWorkingDays,
  daysWord,
  decisionNames,
  formatDate,
  formatDateTime,
  formatMoney,
  MODERATION_WORKING_DAYS,
  reviewType,
  workingDaysUntil,
} from '../api/labels'
import type {
  ModerationQueue,
  NotificationItem,
  PagedResult,
  ProjectDetails,
  ProjectListItem,
  SimilarProject,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { LoadState, PageTitle, StatusTag, useLoad } from '../components/common'

/** Строк модерації: 10 робочих днів від подання; прострочені — червоним. */
function DeadlineTag({ submittedAt }: { submittedAt: string | null }) {
  const { t } = useTranslation()
  if (!submittedAt) return <>—</>
  const deadline = addWorkingDays(new Date(submittedAt), MODERATION_WORKING_DAYS)
  const left = workingDaysUntil(deadline)
  const color = left < 0 ? 'error' : left <= 2 ? 'warning' : 'default'
  return (
    <Tooltip
      title={`${t('Подано')} ${formatDate(submittedAt)} · ${t('строк')} ${formatDate(deadline.toISOString())}`}
    >
      <Tag color={color} style={{ marginInlineEnd: 0 }}>
        {left < 0
          ? `${t('прострочено на')} ${daysWord(-left)}`
          : left === 0
            ? t('строк сьогодні')
            : `${t('лишилось')} ${daysWord(left)}`}
      </Tag>
    </Tooltip>
  )
}

/** Позначка «Ваш проєкт»: власний проєкт розглядає інший працівник. */
function OwnTag() {
  const { t } = useTranslation()
  return (
    <Tooltip title={t('Ви автор цього проєкту, тому розглядати його має інший працівник.')}>
      <Tag color="gold">{t('Ваш проєкт')}</Tag>
    </Tooltip>
  )
}
import { SinglePointMap } from '../components/ProjectMap'

/** Короткий огляд проєкту для модератора й експерта. */
function ProjectReview({ p }: { p: ProjectDetails }) {
  const { t } = useTranslation()
  return (
    <>
      <Descriptions
        size="small"
        column={1}
        bordered
        items={[
          { label: t('Номер'), children: p.regNumber ?? '—' },
          { label: t('Статус'), children: <StatusTag status={p.status} /> },
          { label: t('Категорія'), children: t(p.categoryName) },
          { label: t('Район'), children: t(p.districtName) },
          { label: t('Адреса'), children: p.address ?? '—' },
          { label: t('Автор'), children: p.authorName },
          { label: t('Вартість'), children: <b>{formatMoney(p.cost)}</b> },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 16 }}>
        {t('Опис')}
      </Typography.Title>
      {p.summary && <Typography.Paragraph strong>{p.summary}</Typography.Paragraph>}
      <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>{p.description ?? '—'}</Typography.Paragraph>
      <Typography.Title level={5}>{t('Кошторис')}</Typography.Title>
      <Table
        size="small"
        rowKey="budgetItemId"
        pagination={false}
        dataSource={p.budgetItems}
        columns={[
          { title: t('Позиція'), dataIndex: 'name' },
          { title: t('К-сть'), render: (_, b) => `${b.quantity} ${b.unit}`, width: 90 },
          {
            title: t('Сума'),
            dataIndex: 'amount',
            align: 'right',
            render: (v: number) => formatMoney(v),
            width: 130,
          },
        ]}
      />
      {p.latitude != null && p.longitude != null && (
        <div style={{ marginTop: 16 }}>
          <SinglePointMap lat={p.latitude} lng={p.longitude} height={200} />
        </div>
      )}
      {p.reviews.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16 }}>
            {t('Попередні рішення')}
          </Typography.Title>
          <List
            size="small"
            dataSource={p.reviews}
            renderItem={(r) => (
              <List.Item>
                <div>
                  <b>{t(reviewType[r.reviewType])}</b> — {t(decisionNames[r.decision])}{' '}
                  <Typography.Text type="secondary">
                    ({r.reviewerName}, {formatDateTime(r.createdAt)})
                  </Typography.Text>
                  {r.comment && <div>{r.comment}</div>}
                </div>
              </List.Item>
            )}
          />
        </>
      )}
    </>
  )
}

// ---------- модерація ----------

export function ModerationPage() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const { user } = useAuth()
  const own = (p: ProjectListItem) => p.authorId === user?.userId
  const { data, loading, error, reload } = useLoad(() => api<ModerationQueue>('/api/moderation/queue'), [])
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [assignFor, setAssignFor] = useState<ProjectListItem | null>(null)
  // 0 — автоматично: модератор з найменшою кількістю проєктів у роботі (задача 9)
  const [assignTo, setAssignTo] = useState<number>(0)

  const publish = (p: ProjectListItem) =>
    modal.confirm({
      title: t('Опублікувати «{{title}}»?', { title: p.title }),
      content: t('Проєкт з’явиться в каталозі й братиме участь у голосуванні. Автор отримає сповіщення.'),
      okText: t('Опублікувати'),
      cancelText: t('Скасувати'),
      onOk: async () => {
        try {
          await api(`/api/moderation/${p.projectId}/publish`, { method: 'POST' })
          message.success(t('Проєкт опубліковано, він з’явився в каталозі'))
          void reload()
        } catch (e) {
          message.error((e as Error).message)
        }
      },
    })

  const assign = async () => {
    if (!assignFor) return
    try {
      const r = await api<{ message: string }>(`/api/moderation/${assignFor.projectId}/assign`, {
        method: 'POST',
        body: { moderatorId: assignTo || null },
      })
      message.success(t(r.message))
      setAssignFor(null)
      void reload()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const columns = (ready: boolean) => [
    {
      title: t('Проєкт'),
      render: (_: unknown, p: ProjectListItem) => (
        <>
          <b>{p.title}</b> {own(p) && <OwnTag />}
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>
            {p.regNumber} · {t(p.categoryName)} · {t(p.districtName)} · {p.authorName}
          </div>
        </>
      ),
    },
    ...(ready
      ? []
      : [
          {
            title: t('Строк'),
            width: 190,
            render: (_: unknown, p: ProjectListItem) =>
              p.status === 'revision' ? (
                <Typography.Text type="secondary">{t('у автора')}</Typography.Text>
              ) : (
                <DeadlineTag submittedAt={p.submittedAt} />
              ),
          },
        ]),
    {
      title: t('Вартість'),
      dataIndex: 'cost',
      align: 'right' as const,
      width: 130,
      render: (v: number) => formatMoney(v),
    },
    { title: t('Статус'), dataIndex: 'status', width: 140, render: (s: string) => <StatusTag status={s} /> },
    {
      title: t('Модератор'),
      dataIndex: 'moderatorName',
      width: 160,
      render: (v: string | null) =>
        v ?? <Typography.Text type="secondary">{t('не призначено')}</Typography.Text>,
    },
    {
      title: '',
      width: 190,
      render: (_: unknown, p: ProjectListItem) => (
        <Space>
          {ready ? (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              disabled={own(p)}
              onClick={() => publish(p)}
            >
              {t('Опублікувати')}
            </Button>
          ) : (
            <Button
              type="primary"
              size="small"
              icon={<AuditOutlined />}
              disabled={own(p)}
              onClick={() => setReviewId(p.projectId)}
            >
              {t('Перевірити')}
            </Button>
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'review', icon: <AuditOutlined />, label: t('Перевірити'), disabled: own(p) },
                { key: 'assign', icon: <UserAddOutlined />, label: t('Призначити модератора') },
                { key: 'view', icon: <EyeOutlined />, label: t('Відкрити картку') },
              ],
              onClick: ({ key }) => {
                if (key === 'review') setReviewId(p.projectId)
                if (key === 'assign') {
                  setAssignFor(p)
                  setAssignTo(p.moderatorId ?? 0)
                }
                if (key === 'view') navigate(`/projects/${p.projectId}`)
              },
            }}
          >
            <Button size="small" icon={<MoreOutlined />} aria-label={t('Дії')} />
          </Dropdown>
        </Space>
      ),
    },
  ]

  return (
    <>
      <PageTitle
        title={t('Модерація')}
        subtitle={t('Перевірка поданих проєктів і публікація допущених')}
        help="moderation"
      />
      <LoadState loading={loading} error={error}>
        {data && (
          <Card>
            <Tabs
              items={[
                {
                  key: 'queue',
                  label: (
                    <Badge count={data.queue.length} offset={[12, -2]} size="small">
                      {t('Черга на перевірку')}
                    </Badge>
                  ),
                  children: (
                    <Table
                      rowKey="projectId"
                      dataSource={data.queue}
                      columns={columns(false)}
                      pagination={false}
                      scroll={{ x: 900 }}
                      locale={{ emptyText: <Empty description={t('Черга порожня')} /> }}
                    />
                  ),
                },
                {
                  key: 'ready',
                  label: (
                    <Badge count={data.readyToPublish.length} offset={[12, -2]} size="small" color="green">
                      {t('Допущені, готові до публікації')}
                    </Badge>
                  ),
                  children: (
                    <Table
                      rowKey="projectId"
                      dataSource={data.readyToPublish}
                      columns={columns(true)}
                      pagination={false}
                      scroll={{ x: 900 }}
                      locale={{ emptyText: <Empty description={t('Немає допущених проєктів')} /> }}
                    />
                  ),
                },
              ]}
            />
          </Card>
        )}
      </LoadState>

      <ModerationDrawer
        projectId={reviewId}
        onClose={() => setReviewId(null)}
        onDone={() => {
          setReviewId(null)
          void reload()
        }}
      />

      <Modal
        open={!!assignFor}
        title={t('Призначити модератора')}
        onCancel={() => setAssignFor(null)}
        onOk={() => void assign()}
        okText={t('Призначити')}
        cancelText={t('Скасувати')}
      >
        <Typography.Paragraph>{assignFor?.title}</Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          value={assignTo}
          onChange={setAssignTo}
          options={[
            { value: 0, label: t('Автоматично — найменше завантажений модератор') },
            ...(data?.moderators ?? [])
              .filter((m) => m.id !== assignFor?.authorId)
              .map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
      </Modal>
    </>
  )
}

function ModerationDrawer({
  projectId,
  onClose,
  onDone,
}: {
  projectId: number | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<{ decision: string; comment?: string; duplicateOfId?: number }>()
  const decision = Form.useWatch('decision', form)
  const [busy, setBusy] = useState(false)
  const { data, loading, error } = useLoad(
    async () =>
      projectId == null
        ? null
        : {
            p: await api<ProjectDetails>(`/api/projects/${projectId}`),
            similar: await api<SimilarProject[]>(`/api/moderation/${projectId}/similar`),
          },
    [projectId],
  )
  const candidates = useLoad(
    async () =>
      data
        ? api<PagedResult<ProjectListItem>>(
            `/api/projects?campaignId=${data.p.campaignId}&pageSize=100&sort=title`,
          )
        : null,
    [data],
  )

  // наслідки рішень, які варто підтвердити (рішення фіксується в Review і змінює статус — тригер сповістить автора)
  const consequences: Record<string, string> = {
    reject: 'Проєкт буде відхилено остаточно, автор отримає ваше обґрунтування.',
    duplicate: 'Проєкт буде відхилено як дублікат із посиланням на оригінал.',
    revise: 'Проєкт повернеться автору; після доопрацювання він подасть його повторно.',
  }

  const submit = (v: { decision: string; comment?: string; duplicateOfId?: number }) => {
    if (!consequences[v.decision]) return void send(v)
    modal.confirm({
      title: t('Підтвердити рішення?'),
      content: t(consequences[v.decision]),
      okText: t('Підтвердити'),
      okButtonProps: { danger: v.decision !== 'revise' },
      cancelText: t('Скасувати'),
      onOk: () => send(v),
    })
  }

  const send = async (v: { decision: string; comment?: string; duplicateOfId?: number }) => {
    setBusy(true)
    try {
      await api(`/api/moderation/${projectId}/decision`, { method: 'POST', body: v })
      message.success(t('Рішення збережено'))
      form.resetFields()
      onDone()
    } catch (e) {
      message.error((e as Error).message, 6)
    } finally {
      setBusy(false)
    }
  }

  const needComment = decision === 'revise' || decision === 'reject'
  const dupOptions = [
    ...(data?.similar ?? []).map((s) => ({
      value: s.projectId,
      label: `${s.regNumber ?? '#' + s.projectId} ${s.title} (${t('схожий')})`,
    })),
    ...(candidates.data?.items ?? [])
      .filter(
        (x) => x.projectId !== projectId && !(data?.similar ?? []).some((s) => s.projectId === x.projectId),
      )
      .map((x) => ({ value: x.projectId, label: `${x.regNumber} ${x.title}` })),
  ]

  return (
    <Drawer
      open={projectId != null}
      onClose={onClose}
      width={Math.min(720, window.innerWidth)}
      title={data?.p.title ?? t('Перевірка проєкту')}
      destroyOnClose
    >
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            {data.similar.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('Можливі дублікати')}
                description={data.similar.map((s) => (
                  <div key={s.projectId}>
                    <Link to={`/projects/${s.projectId}`} target="_blank">
                      {s.regNumber} «{s.title}»
                    </Link>{' '}
                    <Tag>
                      {t('спільних слів')}: {s.commonWords}
                    </Tag>
                  </div>
                ))}
              />
            )}
            <ProjectReview p={data.p} />
            <Card
              size="small"
              title={t('Рішення модератора')}
              style={{ marginTop: 16, background: '#f7f9fc' }}
            >
              <Form form={form} layout="vertical" onFinish={submit} initialValues={{ decision: 'approve' }}>
                <Form.Item name="decision">
                  <Radio.Group>
                    <Space direction="vertical">
                      <Radio value="approve">{t('Допустити (далі — публікація)')}</Radio>
                      <Radio value="expertise">{t('На експертизу')}</Radio>
                      <Radio value="revise">{t('Повернути на доопрацювання (з коментарем)')}</Radio>
                      <Radio value="reject">{t('Відхилити (з обґрунтуванням)')}</Radio>
                      <Radio value="duplicate">{t('Позначити як дублікат')}</Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
                {decision === 'duplicate' && (
                  <Form.Item
                    name="duplicateOfId"
                    label={t('Дублікатом якого проєкту є цей')}
                    rules={[{ required: true, message: t('Оберіть оригінал.') }]}
                  >
                    <Select showSearch optionFilterProp="label" options={dupOptions} />
                  </Form.Item>
                )}
                <Form.Item
                  name="comment"
                  label={needComment ? t('Коментар (обов’язково)') : t('Коментар')}
                  rules={
                    needComment
                      ? [{ required: true, message: t('Для цього рішення коментар обов’язковий.') }]
                      : []
                  }
                >
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<CheckOutlined />} loading={busy}>
                  {t('Зберегти рішення')}
                </Button>
              </Form>
            </Card>
          </>
        )}
      </LoadState>
    </Drawer>
  )
}

// ---------- експертиза ----------

export function ExpertisePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { message } = App.useApp()
  const { data, loading, error, reload } = useLoad(() => api<ProjectListItem[]>('/api/expertise'), [])
  const [selected, setSelected] = useState<number | null>(null)
  const details = useLoad(
    () => (selected ? api<ProjectDetails>(`/api/projects/${selected}`) : Promise.resolve(null)),
    [selected],
  )
  const [form] = Form.useForm<{ reviewType: string; decision: string; comment?: string }>()
  const decision = Form.useWatch('decision', form)
  const [busy, setBusy] = useState(false)

  const submit = async (v: { reviewType: string; decision: string; comment?: string }) => {
    setBusy(true)
    try {
      await api(`/api/expertise/${selected}/conclusion`, { method: 'POST', body: v })
      message.success(t('Висновок збережено'))
      setSelected(null)
      form.resetFields()
      void reload()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle
        title={t('Експертиза')}
        subtitle={t('Проєкти, передані на технічну, юридичну чи фінансову експертизу')}
        help="expertise"
      />
      <Card>
        <LoadState loading={loading} error={error}>
          <Table
            rowKey="projectId"
            dataSource={data ?? []}
            pagination={false}
            scroll={{ x: 760 }}
            locale={{ emptyText: <Empty description={t('Проєктів на експертизі немає')} /> }}
            columns={[
              {
                title: t('Проєкт'),
                render: (_, p) => (
                  <>
                    <b>{p.title}</b>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                      {p.regNumber} · {t(p.categoryName)} · {t(p.districtName)}
                    </div>
                  </>
                ),
              },
              {
                title: t('Вартість'),
                dataIndex: 'cost',
                align: 'right',
                width: 130,
                render: (v: number) => formatMoney(v),
              },
              { title: t('Коментар модератора'), dataIndex: 'lastComment', width: 220 },
              {
                title: '',
                width: 150,
                render: (_, p) =>
                  p.authorId === user?.userId ? (
                    <OwnTag />
                  ) : (
                    <Button type="primary" size="small" onClick={() => setSelected(p.projectId)}>
                      {t('Дати висновок')}
                    </Button>
                  ),
              },
            ]}
          />
        </LoadState>
      </Card>

      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        width={Math.min(720, window.innerWidth)}
        title={details.data?.title ?? t('Експертиза')}
        destroyOnClose
      >
        <LoadState loading={details.loading} error={details.error}>
          {details.data && (
            <>
              <ProjectReview p={details.data} />
              <Card
                size="small"
                title={t('Висновок експерта')}
                style={{ marginTop: 16, background: '#f7f9fc' }}
              >
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={submit}
                  initialValues={{ reviewType: 'technical', decision: 'approve' }}
                >
                  <Form.Item name="reviewType" label={t('Вид експертизи')}>
                    <Radio.Group
                      optionType="button"
                      options={[
                        { value: 'technical', label: t('Технічна') },
                        { value: 'legal', label: t('Юридична') },
                        { value: 'financial', label: t('Фінансова') },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="decision" label={t('Висновок')}>
                    <Radio.Group>
                      <Space direction="vertical">
                        <Radio value="approve">{t('Позитивний — повернути модератору для публікації')}</Radio>
                        <Radio value="revise">{t('Потрібне доопрацювання')}</Radio>
                        <Radio value="reject">{t('Негативний — відхилити')}</Radio>
                      </Space>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item
                    name="comment"
                    label={t('Обґрунтування')}
                    rules={
                      decision !== 'approve'
                        ? [{ required: true, message: t('Для цього висновку коментар обов’язковий.') }]
                        : []
                    }
                  >
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={busy} icon={<CheckOutlined />}>
                    {t('Зберегти висновок')}
                  </Button>
                </Form>
              </Card>
            </>
          )}
        </LoadState>
      </Drawer>
    </>
  )
}

// ---------- сповіщення ----------

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useLoad(() => api<NotificationItem[]>('/api/notifications'), [])

  const markRead = async (n: NotificationItem) => {
    await api(`/api/notifications/${n.notificationId}/read`, { method: 'POST' })
    void reload()
  }

  const open = async (n: NotificationItem) => {
    if (!n.isRead) await api(`/api/notifications/${n.notificationId}/read`, { method: 'POST' })
    if (n.projectId) navigate(`/projects/${n.projectId}`)
    else void reload()
  }

  return (
    <>
      <PageTitle
        title={t('Сповіщення')}
        help="notifications"
        extra={
          <Button
            onClick={async () => {
              await api('/api/notifications/read-all', { method: 'POST' })
              void reload()
            }}
          >
            {t('Прочитати всі')}
          </Button>
        }
      />
      <Card>
        <LoadState loading={loading} error={error}>
          <List
            dataSource={data ?? []}
            locale={{ emptyText: <Empty description={t('Сповіщень немає')} /> }}
            renderItem={(n) => (
              <List.Item
                style={{ cursor: 'pointer', background: n.isRead ? undefined : '#f0f6ff', paddingInline: 12 }}
                onClick={() => void open(n)}
                actions={[
                  ...(n.projectId
                    ? [
                        <Button key="open" type="link" size="small">
                          {t('До проєкту')}
                        </Button>,
                      ]
                    : []),
                  ...(!n.isRead
                    ? [
                        <Button
                          key="read"
                          type="link"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            void markRead(n)
                          }}
                        >
                          {t('Позначити прочитаним')}
                        </Button>,
                      ]
                    : []),
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <NotificationOutlined style={{ fontSize: 18, color: n.isRead ? '#bfbfbf' : '#1f5c99' }} />
                  }
                  title={<span style={{ fontWeight: n.isRead ? 400 : 600 }}>{n.body}</span>}
                  description={formatDateTime(n.createdAt)}
                />
              </List.Item>
            )}
          />
        </LoadState>
      </Card>
    </>
  )
}
