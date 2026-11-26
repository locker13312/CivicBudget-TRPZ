import {
  ArrowLeftOutlined,
  DeleteOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  PlusOutlined,
  SaveOutlined,
  SendOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Typography,
  Upload,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, blobUrl } from '../api/client'
import { formatMoney } from '../api/labels'
import type {
  AttachmentItem,
  BudgetItemInput,
  Campaign,
  ProjectEdit,
  ProjectForEdit,
  References,
  SimilarProject,
  SubmitResult,
} from '../api/types'
import { LoadState, NoCampaign, PageTitle, StatusTag, useLoad } from '../components/common'
import { PointPicker } from '../components/ProjectMap'

interface FormValues {
  title: string
  summary?: string
  description?: string
  address?: string
  categoryId?: number
  districtId?: number
  budgetItems: BudgetItemInput[]
}

const emptyItem: BudgetItemInput = { name: '', unit: 'шт', quantity: 1, unitPrice: 0 }

/** Форма проєкту: опис, місце на карті, кошторис (сума рахується), вкладення, збереження чернетки, подання. */
export function ProjectFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const { data, loading, error, setData } = useLoad(async () => {
    const edit = isNew ? null : await api<ProjectForEdit>(`/api/my/projects/${id}`)
    // наявний проєкт показуємо з його кампанією; новий створюється лише в поточній
    const campaign = edit
      ? await api<Campaign>(`/api/campaigns/${edit.project.campaignId}`)
      : await api<Campaign>('/api/campaigns/current').catch(() => null)
    return { refs: await api<References>('/api/reference'), campaign, edit }
  }, [id])

  return (
    <>
      <Link to="/my/projects">
        <ArrowLeftOutlined /> {t('Мої проєкти')}
      </Link>
      <div style={{ height: 12 }} />
      <LoadState loading={loading} error={error}>
        {data && !data.campaign && <NoCampaign />}
        {data?.campaign && (
          <ProjectForm
            key={id}
            refs={data.refs}
            campaign={data.campaign}
            edit={data.edit}
            onReload={(edit) => setData({ ...data, edit })}
          />
        )}
      </LoadState>
    </>
  )
}

function ProjectForm({
  refs,
  campaign,
  edit,
  onReload,
}: {
  refs: References
  campaign: Campaign
  edit: ProjectForEdit | null
  onReload: (e: ProjectForEdit) => void
}) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const p = edit?.project
  const readOnly = !!edit && !edit.canEdit
  const [point, setPoint] = useState<{ lat: number | null; lng: number | null }>({
    lat: p?.latitude ?? null,
    lng: p?.longitude ?? null,
  })
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<SimilarProject[]>([])
  const [attachments, setAttachments] = useState<AttachmentItem[]>(p?.attachments ?? [])

  const items = Form.useWatch('budgetItems', form) ?? []
  const total = items.reduce((s, i) => s + (Number(i?.quantity) || 0) * (Number(i?.unitPrice) || 0), 0)
  const costOk = total >= campaign.minProjectCost && total <= campaign.maxProjectCost
  const title = Form.useWatch('title', form)
  const summary = Form.useWatch('summary', form)
  const description = Form.useWatch('description', form)

  // попередження про схожі проєкти (можливий дублікат) — з паузою після введення
  useEffect(() => {
    if (readOnly || !title || title.length < 5) return setSimilar([])
    const timer = setTimeout(() => {
      api<SimilarProject[]>('/api/my/projects/similar', {
        method: 'POST',
        body: { projectId: p?.projectId ?? null, title, summary, description },
      })
        .then(setSimilar)
        .catch(() => undefined)
    }, 800)
    return () => clearTimeout(timer)
  }, [title, summary, description, readOnly, p?.projectId])

  const initial: FormValues = useMemo(
    () => ({
      title: p?.title ?? '',
      summary: p?.summary ?? '',
      description: p?.description ?? '',
      address: p?.address ?? '',
      categoryId: p?.categoryId,
      districtId: p?.districtId,
      budgetItems: p?.budgetItems.map((b) => ({
        name: b.name,
        unit: b.unit,
        quantity: b.quantity,
        unitPrice: b.unitPrice,
      })) ?? [{ ...emptyItem }],
    }),
    [p],
  )

  const body = (v: FormValues): ProjectEdit => ({
    title: v.title,
    summary: v.summary ?? '',
    description: v.description ?? '',
    address: v.address ?? '',
    categoryId: v.categoryId ?? 0,
    districtId: v.districtId ?? 0,
    budgetItems: (v.budgetItems ?? []).filter((b) => b && b.name),
    latitude: point.lat,
    longitude: point.lng,
  })

  /** Зберегти чернетку; повертає id проєкту. */
  const save = async (): Promise<number | null> => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return null
    if (isNewProject()) {
      const r = await api<{ projectId: number }>('/api/my/projects', { method: 'POST', body: body(v) })
      return r.projectId
    }
    await api(`/api/my/projects/${p!.projectId}`, { method: 'PUT', body: body(v) })
    return p!.projectId
  }
  const isNewProject = () => !p

  const onSave = async () => {
    setBusy('save')
    setError(null)
    try {
      const pid = await save()
      if (pid == null) return
      message.success(t('Чернетку збережено'))
      if (isNewProject()) navigate(`/my/projects/${pid}`, { replace: true })
      else onReload(await api<ProjectForEdit>(`/api/my/projects/${pid}`))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const onSubmit = async () => {
    setBusy('submit')
    setError(null)
    let pid: number | null = null
    try {
      pid = await save()
      if (pid == null) return
      // подання — збережена процедура usp_SubmitProject (перевірки 50010–50015 у БД)
      const r = await api<SubmitResult>(`/api/my/projects/${pid}/submit`, { method: 'POST' })
      navigate('/my/projects', {
        state: {
          flash: t('Проєкт подано: {{reg}}, вартість {{cost}}. Він передається на модерацію.', {
            reg: r.regNumber,
            cost: formatMoney(r.estimatedCost),
          }),
        },
      })
    } catch (e) {
      setError((e as Error).message)
      if (isNewProject() && pid) navigate(`/my/projects/${pid}`, { replace: true })
    } finally {
      setBusy(null)
    }
  }

  const upload = async (file: File) => {
    if (!p) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const a = await api<AttachmentItem>(`/api/my/projects/${p.projectId}/attachments`, {
        method: 'POST',
        body: fd,
      })
      setAttachments((x) => [...x, a])
      message.success(t('Файл додано: {{name}}', { name: a.fileName }))
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const remove = async (a: AttachmentItem) => {
    await api(`/api/my/projects/${p!.projectId}/attachments/${a.attachmentId}`, { method: 'DELETE' })
    setAttachments((x) => x.filter((y) => y.attachmentId !== a.attachmentId))
  }

  const openFile = async (a: AttachmentItem) =>
    window.open(await blobUrl(`/api/files/${a.attachmentId}`), '_blank')

  const openCategories = refs.categories.filter((c) =>
    campaign.categories.some((cc) => cc.categoryId === c.id),
  )

  return (
    <>
      <PageTitle
        title={p ? p.title : t('Новий проєкт')}
        subtitle={
          p ? (
            <Space>
              <StatusTag status={p.status} />
              {p.regNumber && <span>{p.regNumber}</span>}
              <span>{campaign.name}</span>
            </Space>
          ) : (
            campaign.name
          )
        }
        help="projectForm"
      />

      {edit?.revisionComment && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('Проєкт повернуто на доопрацювання')}
          description={edit.revisionComment}
        />
      )}
      {readOnly && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('Проєкт уже подано — редагування недоступне.')}
          action={<Link to={`/projects/${p!.projectId}`}>{t('Картка проєкту')}</Link>}
        />
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Form form={form} layout="vertical" initialValues={initial} disabled={readOnly} requiredMark="optional">
        <Row gutter={[24, 0]}>
          <Col xs={24} lg={16}>
            <Card title={t('Опис')} style={{ marginBottom: 24 }}>
              <Form.Item
                name="title"
                label={t('Назва')}
                tooltip={t('Коротко й зрозуміло: що буде зроблено і де')}
                rules={[
                  { required: true, message: t('Вкажіть назву проєкту.') },
                  { min: 5, max: 200, message: t('Назва — від 5 до 200 символів.') },
                ]}
              >
                <Input maxLength={200} showCount />
              </Form.Item>
              {similar.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  style={{ marginBottom: 16 }}
                  message={t('Схожі проєкти в цій кампанії — перевірте, чи ви не подаєте дублікат:')}
                  description={
                    <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                      {similar.map((s) => (
                        <li key={s.projectId}>
                          <Link to={`/projects/${s.projectId}`} target="_blank">
                            {s.regNumber} «{s.title}»
                          </Link>{' '}
                          <StatusTag status={s.status} />
                        </li>
                      ))}
                    </ul>
                  }
                />
              )}
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="categoryId"
                    label={t('Категорія')}
                    rules={[{ required: true, message: t('Оберіть категорію.') }]}
                  >
                    <Select options={openCategories.map((c) => ({ value: c.id, label: t(c.name) }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="districtId"
                    label={t('Район')}
                    rules={[{ required: true, message: t('Оберіть район.') }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={refs.districts.map((d) => ({ value: d.id, label: t(d.name) }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="summary" label={t('Короткий опис')} tooltip={t('Показується в каталозі')}>
                <Input.TextArea rows={2} maxLength={500} showCount />
              </Form.Item>
              <Form.Item
                name="description"
                label={t('Повний опис')}
                tooltip={t('Обов’язковий для подання: проблема, рішення, хто виграє')}
              >
                <Input.TextArea rows={6} />
              </Form.Item>
            </Card>

            <Card title={t('Кошторис')} style={{ marginBottom: 24 }}>
              <Form.List name="budgetItems">
                {(fields, { add, remove }) => (
                  <>
                    <Row gutter={8} style={{ fontWeight: 600, marginBottom: 6, color: '#595959' }}>
                      <Col flex="auto">{t('Позиція')}</Col>
                      <Col style={{ width: 90 }}>{t('Од.')}</Col>
                      <Col style={{ width: 100 }}>{t('К-сть')}</Col>
                      <Col style={{ width: 130 }}>{t('Ціна, грн')}</Col>
                      <Col style={{ width: 130, textAlign: 'right' }}>{t('Сума')}</Col>
                      <Col style={{ width: 40 }} />
                    </Row>
                    {fields.map((f) => {
                      const it = items[f.name]
                      const amount = (Number(it?.quantity) || 0) * (Number(it?.unitPrice) || 0)
                      return (
                        <Row gutter={8} key={f.key} align="top" wrap={false}>
                          <Col flex="auto">
                            <Form.Item
                              name={[f.name, 'name']}
                              rules={[{ required: true, message: t('Назва позиції') }]}
                            >
                              <Input placeholder={t('Напр., лавка паркова')} />
                            </Form.Item>
                          </Col>
                          <Col style={{ width: 90 }}>
                            <Form.Item name={[f.name, 'unit']} rules={[{ required: true, message: ' ' }]}>
                              <Input />
                            </Form.Item>
                          </Col>
                          <Col style={{ width: 100 }}>
                            <Form.Item name={[f.name, 'quantity']} rules={[{ required: true, message: ' ' }]}>
                              <InputNumber min={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col style={{ width: 130 }}>
                            <Form.Item
                              name={[f.name, 'unitPrice']}
                              rules={[{ required: true, message: ' ' }]}
                            >
                              <InputNumber min={0} step={1000} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col style={{ width: 130, textAlign: 'right', paddingTop: 5 }}>
                            {formatMoney(amount)}
                          </Col>
                          <Col style={{ width: 40 }}>
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => remove(f.name)}
                              aria-label={t('Видалити позицію')}
                              disabled={readOnly || fields.length === 1}
                            />
                          </Col>
                        </Row>
                      )
                    })}
                    {!readOnly && (
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => add({ ...emptyItem, name: '' })}
                        block
                      >
                        {t('Додати позицію')}
                      </Button>
                    )}
                  </>
                )}
              </Form.List>
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Card style={{ marginBottom: 24, position: 'sticky', top: 80, zIndex: 1 }}>
              <Statistic
                title={t('Вартість проєкту')}
                value={total}
                precision={2}
                groupSeparator=" "
                decimalSeparator=","
                suffix={t('грн')}
                valueStyle={{ color: costOk ? '#2e7d32' : '#c62828' }}
              />
              <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
                {t('Допустимо')}: {formatMoney(campaign.minProjectCost)} —{' '}
                {formatMoney(campaign.maxProjectCost)}
              </Typography.Paragraph>
              {!readOnly && (
                <Flex vertical gap={8}>
                  <Button
                    icon={<SaveOutlined />}
                    block
                    loading={busy === 'save'}
                    disabled={!!busy}
                    onClick={() => void onSave()}
                  >
                    {t('Зберегти чернетку')}
                  </Button>
                  <Popconfirm
                    title={t('Подати проєкт на розгляд?')}
                    description={t(
                      'Після подання редагувати можна буде лише після повернення на доопрацювання.',
                    )}
                    okText={t('Подати')}
                    cancelText={t('Скасувати')}
                    onConfirm={() => void onSubmit()}
                  >
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      block
                      loading={busy === 'submit'}
                      disabled={!!busy}
                    >
                      {p?.status === 'revision' ? t('Подати повторно') : t('Подати')}
                    </Button>
                  </Popconfirm>
                </Flex>
              )}
            </Card>

            <Card title={t('Місце на карті')} style={{ marginBottom: 24 }} styles={{ body: { padding: 12 } }}>
              <PointPicker
                lat={point.lat}
                lng={point.lng}
                disabled={readOnly}
                onChange={(lat, lng) => setPoint({ lat, lng })}
              />
              <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {point.lat != null
                    ? `${point.lat}, ${point.lng}`
                    : t('Клацніть на карті, щоб позначити місце')}
                </Typography.Text>
                {point.lat != null && !readOnly && (
                  <Button size="small" type="link" onClick={() => setPoint({ lat: null, lng: null })}>
                    {t('Прибрати')}
                  </Button>
                )}
              </Flex>
              <Form.Item name="address" label={t('Адреса')} style={{ marginTop: 12, marginBottom: 0 }}>
                <Input maxLength={200} placeholder={t('вул. …, буд. …')} />
              </Form.Item>
            </Card>

            <Card title={t('Фото та документи')}>
              {p ? (
                <>
                  <List
                    size="small"
                    dataSource={attachments}
                    locale={{
                      emptyText: (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Файлів немає')} />
                      ),
                    }}
                    renderItem={(a) => (
                      <List.Item
                        actions={
                          readOnly
                            ? []
                            : [
                                <Popconfirm
                                  key="d"
                                  title={t('Видалити файл?')}
                                  onConfirm={() => void remove(a)}
                                  okText={t('Так')}
                                  cancelText={t('Ні')}
                                >
                                  <Button
                                    type="text"
                                    danger
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    aria-label={t('Видалити')}
                                  />
                                </Popconfirm>,
                              ]
                        }
                      >
                        <a onClick={() => void openFile(a)}>
                          {a.mimeType === 'application/pdf' ? <FilePdfOutlined /> : <FileImageOutlined />}{' '}
                          {a.fileName}
                        </a>
                      </List.Item>
                    )}
                  />
                  {!readOnly && (
                    <Upload
                      accept=".jpg,.jpeg,.png,.pdf"
                      showUploadList={false}
                      multiple
                      beforeUpload={(file) => {
                        void upload(file)
                        return false
                      }}
                    >
                      <Button icon={<UploadOutlined />} style={{ marginTop: 8 }}>
                        {t('Додати файл (JPG, PNG, PDF до 20 МБ)')}
                      </Button>
                    </Upload>
                  )}
                </>
              ) : (
                <Typography.Text type="secondary">
                  {t('Збережіть чернетку, щоб додати фото й документи.')}
                </Typography.Text>
              )}
            </Card>
          </Col>
        </Row>
      </Form>
    </>
  )
}
