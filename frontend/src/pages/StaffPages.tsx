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
  Typography,
} from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { decisionNames, formatDateTime, formatMoney, reviewType } from '../api/labels'
import type {
  ModerationQueue,
  NotificationItem,
  PagedResult,
  ProjectDetails,
  ProjectListItem,
  SimilarProject,
} from '../api/types'
import { LoadState, PageTitle, StatusTag, useLoad } from '../components/common'
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
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useLoad(() => api<ModerationQueue>('/api/moderation/queue'), [])
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [assignFor, setAssignFor] = useState<ProjectListItem | null>(null)
  const [assignTo, setAssignTo] = useState<number | null>(null)

  const publish = async (id: number) => {
    try {
      await api(`/api/moderation/${id}/publish`, { method: 'POST' })
      message.success(t('Проєкт опубліковано — він з’явився в каталозі'))
      void reload()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const assign = async () => {
    if (!assignFor || !assignTo) return
    try {
      await api(`/api/moderation/${assignFor.projectId}/assign`, {
        method: 'POST',
        body: { moderatorId: assignTo },
      })
      message.success(t('Модератора призначено'))
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
          <b>{p.title}</b>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>
            {p.regNumber} · {t(p.categoryName)} · {t(p.districtName)} · {p.authorName}
          </div>
        </>
      ),
    },
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
              onClick={() => void publish(p.projectId)}
            >
              {t('Опублікувати')}
            </Button>
          ) : (
            <Button
              type="primary"
              size="small"
              icon={<AuditOutlined />}
              onClick={() => setReviewId(p.projectId)}
            >
              {t('Перевірити')}
            </Button>
          )}
          {/* контекстне меню рядка */}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'review', icon: <AuditOutlined />, label: t('Перевірити') },
                { key: 'assign', icon: <UserAddOutlined />, label: t('Призначити модератора') },
                { key: 'view', icon: <EyeOutlined />, label: t('Відкрити картку') },
              ],
              onClick: ({ key }) => {
                if (key === 'review') setReviewId(p.projectId)
                if (key === 'assign') {
                  setAssignFor(p)
                  setAssignTo(p.moderatorId)
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
          value={assignTo ?? undefined}
          onChange={setAssignTo}
          options={(data?.moderators ?? []).map((m) => ({ value: m.id, label: m.name }))}
          placeholder={t('Оберіть модератора')}
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
  const { message } = App.useApp()
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

  const submit = async (v: { decision: string; comment?: string; duplicateOfId?: number }) => {
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
                      <Radio value="approve">{t('✓ Допустити (далі — публікація)')}</Radio>
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
                render: (_, p) => (
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
