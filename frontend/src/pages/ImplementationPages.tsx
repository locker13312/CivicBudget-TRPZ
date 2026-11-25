import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EyeOutlined,
  FilePdfOutlined,
  MoreOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Image,
  Input,
  InputNumber,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Timeline,
  Typography,
  Upload,
} from 'antd'
import type { UploadFile } from 'antd'
import type { Dayjs } from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, blobUrl } from '../api/client'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  implementationStatus,
  reportStatus,
  stageStatus,
} from '../api/labels'
import type {
  AttachmentItem,
  ImplementationDetails,
  ImplementationListItem,
  LookupItem,
  PendingReport,
  ProjectListItem,
  StageItem,
} from '../api/types'
import { ExportButton, LoadState, PageTitle, StatusTag, useLoad } from '../components/common'

/** Прогрес реалізації: виконані етапи. */
function StagesProgress({ i }: { i: ImplementationListItem }) {
  return (
    <Progress
      percent={i.stagesTotal ? Math.round((i.stagesDone / i.stagesTotal) * 100) : 0}
      format={() => `${i.stagesDone}/${i.stagesTotal}`}
      size="small"
      status={i.status === 'completed' ? 'success' : 'active'}
    />
  )
}

/** Фото / документи звіту. Публічні файли — напряму, непублічні — з токеном (blob). */
function Files({ files, isPublic }: { files: AttachmentItem[]; isPublic: boolean }) {
  const [urls, setUrls] = useState<Record<number, string>>({})
  const images = files.filter((f) => f.mimeType.startsWith('image/'))
  const docs = files.filter((f) => !f.mimeType.startsWith('image/'))
  const src = (f: AttachmentItem) => (isPublic ? `/api/files/${f.attachmentId}` : urls[f.attachmentId])
  if (!isPublic)
    for (const f of images)
      if (!urls[f.attachmentId])
        void blobUrl(`/api/files/${f.attachmentId}`).then((u) =>
          setUrls((x) => ({ ...x, [f.attachmentId]: u })),
        )
  return (
    <>
      {images.length > 0 && (
        <Image.PreviewGroup>
          <Space wrap style={{ marginTop: 8 }}>
            {images.map((f) => (
              <Image
                key={f.attachmentId}
                src={src(f)}
                width={140}
                height={94}
                style={{ objectFit: 'cover', borderRadius: 6 }}
              />
            ))}
          </Space>
        </Image.PreviewGroup>
      )}
      {docs.map((f) => (
        <div key={f.attachmentId} style={{ marginTop: 6 }}>
          <a
            onClick={async () =>
              window.open(
                isPublic ? `/api/files/${f.attachmentId}` : await blobUrl(`/api/files/${f.attachmentId}`),
                '_blank',
              )
            }
          >
            <FilePdfOutlined /> {f.fileName}
          </a>
        </div>
      ))}
    </>
  )
}

/** Етапи з планом/фактом і звітами. */
function StagesTimeline({
  d,
  isPublic,
  extra,
}: {
  d: ImplementationDetails
  isPublic: boolean
  extra?: (s: StageItem) => React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Timeline
      items={d.stages.map((s) => ({
        color: s.status === 'done' ? 'green' : s.status === 'in_progress' ? 'blue' : 'gray',
        children: (
          <Card size="small" style={{ marginBottom: 4 }}>
            <Flex justify="space-between" wrap gap={8}>
              <div>
                <b>
                  {s.stageNo}. {s.name}
                </b>{' '}
                <StatusTag status={s.status} label={stageStatus[s.status]} />
                <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                  {t('Строк')}: {formatDate(s.plannedEndDate)}
                  {s.completedAt && ` · ${t('виконано')} ${formatDate(s.completedAt)}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>
                  {t('План')}: {formatMoney(s.plannedCost)}
                </div>
                <div>
                  {t('Факт')}: {s.actualCost != null ? formatMoney(s.actualCost) : '—'}
                </div>
              </div>
            </Flex>
            {s.reports.map((r) => (
              <div key={r.reportId} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                <Space size={6} wrap>
                  <Typography.Text strong>{t('Звіт виконавця')}</Typography.Text>
                  <Typography.Text type="secondary">
                    {r.authorName}, {formatDateTime(r.submittedAt)}
                  </Typography.Text>
                  {!isPublic && <StatusTag status={r.status} label={reportStatus[r.status]} />}
                </Space>
                <div>{r.body}</div>
                {!isPublic && r.reviewComment && r.status !== 'submitted' && (
                  <Typography.Text type="secondary">
                    {t('Коментар')}: {r.reviewComment}
                  </Typography.Text>
                )}
                <Files files={r.attachments} isPublic={isPublic} />
              </div>
            ))}
            {extra?.(s)}
          </Card>
        ),
      }))}
    />
  )
}

function Summary({ d }: { d: ImplementationDetails }) {
  const { t } = useTranslation()
  const s = d.summary
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col xs={24} md={14}>
        <Descriptions
          column={1}
          size="small"
          bordered
          items={[
            {
              label: t('Проєкт'),
              children: (
                <Link to={`/projects/${s.projectId}`}>
                  {s.regNumber} {s.title}
                </Link>
              ),
            },
            { label: t('Підрядник'), children: s.contractorName },
            {
              label: t('Контакти'),
              children: [d.contractorPhone, d.contractorEmail].filter(Boolean).join(', ') || '—',
            },
            { label: t('Строки'), children: `${formatDate(s.startDate)} — ${formatDate(s.plannedEndDate)}` },
            {
              label: t('Статус'),
              children: <StatusTag status={s.status} label={implementationStatus[s.status]} />,
            },
          ]}
        />
      </Col>
      <Col xs={24} md={10}>
        <Card size="small">
          <Statistic
            title={t('Витрачено з плану')}
            value={s.actualCost}
            suffix={`/ ${formatMoney(s.plannedBudget)}`}
            groupSeparator=" "
            precision={0}
          />
          <Progress percent={Math.min(100, Math.round((s.actualCost / s.plannedBudget) * 100))} />
          <Typography.Text type="secondary">{t('Етапи')}</Typography.Text>
          <StagesProgress i={s} />
        </Card>
      </Col>
    </Row>
  )
}

const listColumns = (t: (s: string) => string, to: (i: ImplementationListItem) => string) => [
  {
    title: t('Проєкт'),
    render: (_: unknown, i: ImplementationListItem) => (
      <>
        <Link to={to(i)}>
          <b>{i.title}</b>
        </Link>
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          {i.regNumber} · {t(i.categoryName)} · {t(i.districtName)}
        </div>
      </>
    ),
  },
  { title: t('Підрядник'), dataIndex: 'contractorName', width: 190 },
  {
    title: t('План / факт'),
    width: 190,
    render: (_: unknown, i: ImplementationListItem) => (
      <>
        {formatMoney(i.actualCost)}
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          {t('з')} {formatMoney(i.plannedBudget)}
        </div>
      </>
    ),
  },
  {
    title: t('Етапи'),
    width: 150,
    render: (_: unknown, i: ImplementationListItem) => <StagesProgress i={i} />,
  },
  { title: t('Строк'), dataIndex: 'plannedEndDate', width: 110, render: (v: string) => formatDate(v) },
  {
    title: t('Статус'),
    dataIndex: 'status',
    width: 130,
    render: (s: string) => <StatusTag status={s} label={implementationStatus[s]} />,
  },
]

// ======================= публічна сторінка «Хід реалізації» =======================

export function ImplementationListPage() {
  const { t } = useTranslation()
  const { data, loading, error } = useLoad(() => api<ImplementationListItem[]>('/api/implementations'), [])
  return (
    <>
      <PageTitle
        title={t('Хід реалізації')}
        subtitle={t('Проєкти-переможці: підрядник, етапи, план і факт витрат, звіти з фото')}
        help="implementation"
        extra={<ExportButton path="/api/reports/implementation" />}
      />
      <Card>
        <LoadState loading={loading} error={error}>
          <Table
            rowKey="implementationId"
            dataSource={data ?? []}
            pagination={false}
            scroll={{ x: 960 }}
            locale={{ emptyText: <Empty description={t('Проєктів у реалізації ще немає')} /> }}
            columns={[
              { title: t('Рік'), dataIndex: 'campaignYear', width: 70 },
              ...listColumns(t, (i) => `/implementation/${i.implementationId}`),
            ]}
          />
        </LoadState>
      </Card>
    </>
  )
}

export function ImplementationPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { data, loading, error } = useLoad(
    () => api<ImplementationDetails>(`/api/implementations/${id}`),
    [id],
  )
  return (
    <>
      <Link to="/implementation">
        <ArrowLeftOutlined /> {t('Хід реалізації')}
      </Link>
      <div style={{ height: 12 }} />
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            <PageTitle
              title={data.summary.title}
              subtitle={`${data.summary.regNumber} · ${t('Громадський бюджет')} ${data.summary.campaignYear}`}
              help="implementation"
              extra={
                <ExportButton
                  path={`/api/reports/implementation?implementationId=${data.summary.implementationId}`}
                />
              }
            />
            <Summary d={data} />
            <Card title={t('Етапи та звіти')}>
              <StagesTimeline d={data} isPublic />
            </Card>
          </>
        )}
      </LoadState>
    </>
  )
}

// ======================= кабінет виконавця =======================

export function ExecutorPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const list = useLoad(() => api<ImplementationListItem[]>('/api/executor/implementations'), [])
  const [openId, setOpenId] = useState<number | null>(null)
  const details = useLoad(
    () =>
      openId ? api<ImplementationDetails>(`/api/executor/implementations/${openId}`) : Promise.resolve(null),
    [openId],
  )
  const [stageEdit, setStageEdit] = useState<StageItem | null>(null)
  const [reportFor, setReportFor] = useState<StageItem | null>(null)
  const [stageForm] = Form.useForm<{ status: string; actualCost?: number }>()
  const [reportForm] = Form.useForm<{ body: string }>()
  const [files, setFiles] = useState<UploadFile[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    void details.reload()
    void list.reload()
  }

  const saveStage = async () => {
    const v = await stageForm.validateFields()
    try {
      await api(`/api/executor/stages/${stageEdit!.stageId}`, {
        method: 'PUT',
        body: { status: v.status, actualCost: v.actualCost ?? null },
      })
      message.success(t('Етап оновлено'))
      setStageEdit(null)
      refresh()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const sendReport = async () => {
    const v = await reportForm.validateFields()
    const fd = new FormData()
    fd.append('body', v.body)
    for (const f of files) if (f.originFileObj) fd.append('files', f.originFileObj)
    setBusy(true)
    try {
      await api(`/api/executor/stages/${reportFor!.stageId}/reports`, { method: 'POST', body: fd })
      message.success(t('Звіт надіслано на розгляд адміністратору'))
      setReportFor(null)
      setFiles([])
      reportForm.resetFields()
      refresh()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const done = details.data?.summary.status === 'completed'

  return (
    <>
      <PageTitle
        title={t('Кабінет виконавця')}
        subtitle={t('Картки реалізації вашого підрядника')}
        help="executor"
      />
      <Card>
        <LoadState loading={list.loading} error={list.error}>
          <Table
            rowKey="implementationId"
            dataSource={list.data ?? []}
            pagination={false}
            scroll={{ x: 900 }}
            locale={{ emptyText: <Empty description={t('Карток реалізації немає')} /> }}
            columns={[
              ...listColumns(t, () => '/executor'),
              {
                title: '',
                width: 110,
                render: (_, i) => (
                  <Button type="primary" size="small" onClick={() => setOpenId(i.implementationId)}>
                    {t('Відкрити')}
                  </Button>
                ),
              },
            ]}
            onRow={(i) => ({ onClick: () => setOpenId(i.implementationId) })}
          />
        </LoadState>
      </Card>

      <Drawer
        open={openId != null}
        onClose={() => setOpenId(null)}
        width={Math.min(820, window.innerWidth)}
        title={details.data?.summary.title}
      >
        <LoadState loading={details.loading && !details.data} error={details.error}>
          {details.data && (
            <>
              <Summary d={details.data} />
              {done && (
                <Alert
                  type="success"
                  showIcon
                  message={t('Реалізацію завершено.')}
                  style={{ marginBottom: 16 }}
                />
              )}
              <StagesTimeline
                d={details.data}
                isPublic={false}
                extra={(s) =>
                  !done && (
                    <Space style={{ marginTop: 10 }}>
                      <Button
                        size="small"
                        onClick={() => {
                          setStageEdit(s)
                          stageForm.setFieldsValue({
                            status: s.status,
                            actualCost: s.actualCost ?? undefined,
                          })
                        }}
                      >
                        {t('Статус етапу')}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setReportFor(s)}
                      >
                        {t('Звіт з фото')}
                      </Button>
                    </Space>
                  )
                }
              />
            </>
          )}
        </LoadState>
      </Drawer>

      <Modal
        open={!!stageEdit}
        title={`${t('Етап')} ${stageEdit?.stageNo}: ${stageEdit?.name}`}
        onCancel={() => setStageEdit(null)}
        onOk={() => void saveStage()}
        okText={t('Зберегти')}
        cancelText={t('Скасувати')}
      >
        <Form form={stageForm} layout="vertical">
          <Form.Item name="status" label={t('Статус')}>
            <Select
              options={Object.entries(stageStatus).map(([value, label]) => ({ value, label: t(label) }))}
            />
          </Form.Item>
          <Form.Item
            name="actualCost"
            label={t('Фактичні витрати, грн')}
            tooltip={t('Обов’язково для статусу «Виконано»')}
          >
            <InputNumber min={0} step={1000} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!reportFor}
        title={`${t('Звіт про етап')} ${reportFor?.stageNo}: ${reportFor?.name}`}
        onCancel={() => setReportFor(null)}
        onOk={() => void sendReport()}
        okText={t('Надіслати')}
        cancelText={t('Скасувати')}
        confirmLoading={busy}
      >
        <Form form={reportForm} layout="vertical">
          <Form.Item
            name="body"
            label={t('Що виконано')}
            rules={[{ required: true, message: t('Опишіть виконані роботи.') }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
        <Upload
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          listType="picture"
          fileList={files}
          beforeUpload={() => false}
          onChange={({ fileList }) => setFiles(fileList.slice(0, 10))}
        >
          <Button icon={<UploadOutlined />}>{t('Фото або PDF (до 10 файлів)')}</Button>
        </Upload>
      </Modal>
    </>
  )
}

// ======================= адміністратор: реалізація =======================

interface NewImplementation {
  projectId: number
  contractorId: number
  plannedBudget: number
  period: [Dayjs, Dayjs]
  stages: { name: string; plannedEndDate: Dayjs; plannedCost: number }[]
}

export function AdminImplementationPage() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const list = useLoad(() => api<ImplementationListItem[]>('/api/admin/implementations'), [])
  const pending = useLoad(() => api<PendingReport[]>('/api/admin/implementations/reports/pending'), [])
  const form = useLoad(
    () => api<{ winners: ProjectListItem[]; contractors: LookupItem[] }>('/api/admin/implementations/new'),
    [],
  )
  const [openId, setOpenId] = useState<number | null>(null)
  const details = useLoad(
    () =>
      openId ? api<ImplementationDetails>(`/api/admin/implementations/${openId}`) : Promise.resolve(null),
    [openId],
  )
  const [creating, setCreating] = useState(false)
  const [newForm] = Form.useForm<NewImplementation>()
  const [rejecting, setRejecting] = useState<PendingReport | null>(null)
  const [rejectComment, setRejectComment] = useState('')

  const reloadAll = () => {
    void list.reload()
    void pending.reload()
    void form.reload()
    if (openId) void details.reload()
  }

  const review = async (r: PendingReport, decision: 'accepted' | 'rejected', comment?: string) => {
    try {
      await api(`/api/admin/implementations/reports/${r.reportId}/review`, {
        method: 'POST',
        body: { decision, comment },
      })
      message.success(
        decision === 'accepted' ? t('Звіт прийнято — він став публічним') : t('Звіт повернуто виконавцю'),
      )
      setRejecting(null)
      setRejectComment('')
      reloadAll()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const create = async () => {
    const v = await newForm.validateFields().catch(() => null)
    if (!v) return
    try {
      const r = await api<{ implementationId: number }>('/api/admin/implementations', {
        method: 'POST',
        body: {
          projectId: v.projectId,
          contractorId: v.contractorId,
          plannedBudget: v.plannedBudget,
          startDate: v.period[0].format('YYYY-MM-DD'),
          plannedEndDate: v.period[1].format('YYYY-MM-DD'),
          stages: v.stages.map((s) => ({
            name: s.name,
            plannedEndDate: s.plannedEndDate.format('YYYY-MM-DD'),
            plannedCost: s.plannedCost,
          })),
        },
      })
      message.success(t('Картку реалізації створено, проєкт перейшов у статус «Реалізується»'))
      setCreating(false)
      newForm.resetFields()
      reloadAll()
      setOpenId(r.implementationId)
    } catch (e) {
      message.error((e as Error).message, 6)
    }
  }

  const setStatus = (id: number, status: string) =>
    modal.confirm({
      title: t('Змінити статус реалізації?'),
      content: t(implementationStatus[status]),
      okText: t('Так'),
      cancelText: t('Ні'),
      onOk: async () => {
        try {
          await api(`/api/admin/implementations/${id}/status`, { method: 'POST', body: { status } })
          message.success(t('Статус реалізації змінено'))
          reloadAll()
        } catch (e) {
          message.error((e as Error).message)
        }
      },
    })

  return (
    <>
      <PageTitle
        title={t('Реалізація')}
        subtitle={t('Картки реалізації переможців і звіти виконавців')}
        help="adminImplementation"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!form.data?.winners.length}
            onClick={() => setCreating(true)}
          >
            {t('Нова картка')}
          </Button>
        }
      />
      <Card>
        <Tabs
          items={[
            {
              key: 'reports',
              label: (
                <Badge count={pending.data?.length ?? 0} offset={[12, -2]} size="small">
                  {t('Звіти на розгляді')}
                </Badge>
              ),
              children: (
                <LoadState loading={pending.loading && !pending.data} error={pending.error}>
                  <List
                    dataSource={pending.data ?? []}
                    locale={{ emptyText: <Empty description={t('Нових звітів немає')} /> }}
                    renderItem={(r) => (
                      <List.Item
                        actions={[
                          <Button
                            key="a"
                            type="primary"
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={() => void review(r, 'accepted')}
                          >
                            {t('Прийняти')}
                          </Button>,
                          <Button
                            key="r"
                            size="small"
                            danger
                            icon={<CloseOutlined />}
                            onClick={() => setRejecting(r)}
                          >
                            {t('Повернути')}
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <>
                              {r.regNumber} {r.projectTitle} · {t('етап')} {r.stageNo}: {r.stageName}
                            </>
                          }
                          description={`${r.authorName}, ${formatDateTime(r.submittedAt)}`}
                        />
                        <div style={{ maxWidth: 520 }}>
                          {r.body}
                          <Files files={r.attachments} isPublic={false} />
                        </div>
                      </List.Item>
                    )}
                  />
                </LoadState>
              ),
            },
            {
              key: 'list',
              label: t('Картки реалізації'),
              children: (
                <LoadState loading={list.loading && !list.data} error={list.error}>
                  <Table
                    rowKey="implementationId"
                    dataSource={list.data ?? []}
                    pagination={false}
                    scroll={{ x: 1000 }}
                    columns={[
                      ...listColumns(t, () => '/admin/implementation'),
                      {
                        title: '',
                        width: 60,
                        render: (_, i) => (
                          <Dropdown
                            trigger={['click']}
                            menu={{
                              items: [
                                { key: 'open', icon: <EyeOutlined />, label: t('Етапи і звіти') },
                                { key: 'public', icon: <EyeOutlined />, label: t('Публічна сторінка') },
                                { type: 'divider' },
                                ...Object.entries(implementationStatus)
                                  .filter(([s]) => s !== i.status)
                                  .map(([s, label]) => ({
                                    key: 'status:' + s,
                                    label: `${t('Статус')}: ${t(label)}`,
                                  })),
                              ],
                              onClick: ({ key }) => {
                                if (key === 'open') setOpenId(i.implementationId)
                                else if (key === 'public') navigate(`/implementation/${i.implementationId}`)
                                else setStatus(i.implementationId, key.split(':')[1])
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
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={openId != null}
        onClose={() => setOpenId(null)}
        width={Math.min(820, window.innerWidth)}
        title={details.data?.summary.title}
      >
        {details.data && (
          <>
            <Summary d={details.data} />
            <StagesTimeline d={details.data} isPublic={false} />
          </>
        )}
      </Drawer>

      <Modal
        open={!!rejecting}
        title={t('Повернути звіт виконавцю')}
        onCancel={() => setRejecting(null)}
        onOk={() => void review(rejecting!, 'rejected', rejectComment)}
        okText={t('Повернути')}
        cancelText={t('Скасувати')}
        okButtonProps={{ danger: true, disabled: !rejectComment.trim() }}
      >
        <Input.TextArea
          rows={3}
          placeholder={t('Що треба виправити (обов’язково)')}
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
        />
      </Modal>

      <Modal
        open={creating}
        title={t('Нова картка реалізації')}
        width={760}
        onCancel={() => setCreating(false)}
        onOk={() => void create()}
        okText={t('Створити')}
        cancelText={t('Скасувати')}
      >
        <Form
          form={newForm}
          layout="vertical"
          initialValues={{ stages: [{ name: '', plannedCost: 0 }] }}
          onValuesChange={(ch) => {
            if (ch.projectId) {
              const w = form.data?.winners.find((x) => x.projectId === ch.projectId)
              if (w) newForm.setFieldValue('plannedBudget', w.cost)
            }
          }}
        >
          <Form.Item
            name="projectId"
            label={t('Проєкт-переможець')}
            rules={[{ required: true, message: t('Оберіть проєкт.') }]}
          >
            <Select
              options={(form.data?.winners ?? []).map((w) => ({
                value: w.projectId,
                label: `${w.regNumber} ${w.title} — ${formatMoney(w.cost)}`,
              }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="contractorId"
                label={t('Підрядник')}
                rules={[{ required: true, message: t('Оберіть підрядника.') }]}
              >
                <Select
                  options={(form.data?.contractors ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="plannedBudget" label={t('Плановий бюджет, грн')} rules={[{ required: true }]}>
                <InputNumber min={1} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="period"
            label={t('Строки реалізації')}
            rules={[{ required: true, message: t('Вкажіть строки.') }]}
          >
            <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Typography.Text strong>{t('Етапи')}</Typography.Text>
          <Form.List name="stages">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f, idx) => (
                  <Row gutter={8} key={f.key} align="top" style={{ marginTop: 8 }}>
                    <Col flex="24px" style={{ paddingTop: 5 }}>
                      {idx + 1}.
                    </Col>
                    <Col flex="auto">
                      <Form.Item
                        name={[f.name, 'name']}
                        rules={[{ required: true, message: t('Назва етапу') }]}
                      >
                        <Input placeholder={t('Назва етапу')} />
                      </Form.Item>
                    </Col>
                    <Col style={{ width: 150 }}>
                      <Form.Item
                        name={[f.name, 'plannedEndDate']}
                        rules={[{ required: true, message: t('Строк') }]}
                      >
                        <DatePicker format="DD.MM.YYYY" placeholder={t('Строк')} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col style={{ width: 140 }}>
                      <Form.Item name={[f.name, 'plannedCost']} rules={[{ required: true }]}>
                        <InputNumber
                          min={0}
                          step={10000}
                          style={{ width: '100%' }}
                          placeholder={t('План, грн')}
                        />
                      </Form.Item>
                    </Col>
                    <Col>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={fields.length === 1}
                        onClick={() => remove(f.name)}
                      />
                    </Col>
                  </Row>
                ))}
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  onClick={() => add({ name: '', plannedCost: 0 })}
                >
                  {t('Додати етап')}
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  )
}
