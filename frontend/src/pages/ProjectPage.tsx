import { ArrowLeftOutlined, BellFilled, BellOutlined, BuildOutlined, FilePdfOutlined, LikeOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Descriptions, Empty, Flex, Image, List, Row, Space, Statistic, Table, Tag, Timeline, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { decisionNames, formatDate, formatDateTime, formatMoney, reviewType } from '../api/labels'
import { useVotesChanged } from '../api/signalr'
import type { MyBallot, ProjectDetails } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ExportButton, LoadState, PageTitle, ProjectCover, StatusTag, useLoad } from '../components/common'
import { SinglePointMap } from '../components/ProjectMap'

export function ProjectPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { data: p, setData, loading, error } = useLoad(() => api<ProjectDetails>(`/api/projects/${id}`), [id])

  // SignalR: голоси оновлюються наживо
  useVotesChanged((projectId) => {
    if (projectId === 0 || projectId === Number(id))
      void api<ProjectDetails>(`/api/projects/${id}`).then(setData).catch(() => undefined)
  })

  return (
    <>
      <Link to="/projects">
        <ArrowLeftOutlined /> {t('До каталогу')}
      </Link>
      <div style={{ height: 12 }} />
      <LoadState loading={loading} error={error}>
        {p && <Project p={p} onChange={setData} />}
      </LoadState>
    </>
  )
}

function Project({ p, onChange }: { p: ProjectDetails; onChange: (p: ProjectDetails) => void }) {
  const { t } = useTranslation()
  const { user, hasRole } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [ballot, setBallot] = useState<MyBallot | null>(null)
  const [voting, setVoting] = useState(false)
  const images = p.attachments.filter((a) => a.mimeType.startsWith('image/'))
  const docs = p.attachments.filter((a) => !a.mimeType.startsWith('image/'))
  const isStaff = hasRole('moderator', 'expert', 'admin')
  const canVote = hasRole('resident') && p.status === 'published' && p.campaignStatus === 'voting'

  useEffect(() => {
    if (!user) return
    api<{ subscribed: boolean }>(`/api/projects/${p.projectId}/subscription`)
      .then((r) => setSubscribed(r.subscribed))
      .catch(() => undefined)
  }, [user, p.projectId])

  useEffect(() => {
    if (canVote) api<MyBallot>('/api/voting/my').then(setBallot).catch(() => undefined)
  }, [canVote])

  const toggleSubscription = async () => {
    const r = await api<{ subscribed: boolean }>(`/api/projects/${p.projectId}/subscription`, {
      method: subscribed ? 'DELETE' : 'PUT',
    })
    setSubscribed(r.subscribed)
    message.success(r.subscribed ? t('Ви стежите за проєктом') : t('Ви більше не стежите за проєктом'))
  }

  const vote = async () => {
    setVoting(true)
    try {
      const b = await api<MyBallot>(`/api/voting/${p.projectId}`, { method: 'POST' })
      setBallot(b)
      message.success(t('Голос враховано. Лишилось голосів: {{n}}', { n: b.remaining }))
      onChange(await api<ProjectDetails>(`/api/projects/${p.projectId}`))
    } catch (e) {
      message.error((e as Error).message, 6)
    } finally {
      setVoting(false)
    }
  }

  const myVotes = ballot?.projects.find((x) => x.projectId === p.projectId)?.myVotes ?? 0

  return (
    <>
      <PageTitle
        title={p.title}
        subtitle={
          <Space wrap size={6}>
            <StatusTag status={p.status} />
            <Tag>{p.regNumber ?? t('без номера')}</Tag>
            <Tag color="blue">{t(p.categoryName)}</Tag>
            <Tag>{t(p.districtName)}</Tag>
            <span>{p.campaignName}</span>
          </Space>
        }
        help="project"
        extra={
          <>
            {user && subscribed !== null && (
              <Button icon={subscribed ? <BellFilled /> : <BellOutlined />} onClick={() => void toggleSubscription()}>
                {subscribed ? t('Ви стежите') : t('Стежити')}
              </Button>
            )}
            <ExportButton path={`/api/reports/project/${p.projectId}`} />
          </>
        }
      />

      {p.duplicateOfId && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <>
              {t('Проєкт позначено як дублікат')}{' '}
              <Link to={`/projects/${p.duplicateOfId}`}>{p.duplicateOfRegNumber ?? `#${p.duplicateOfId}`}</Link>
            </>
          }
        />
      )}

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden', marginBottom: 24 }}>
            {images.length > 0 ? (
              <Image.PreviewGroup>
                <Image src={`/api/files/${images[0].attachmentId}`} width="100%" height={340} style={{ objectFit: 'cover' }} alt={p.title} />
                {images.length > 1 && (
                  <Flex gap={8} style={{ padding: 8 }} wrap>
                    {images.slice(1).map((a) => (
                      <Image key={a.attachmentId} src={`/api/files/${a.attachmentId}`} width={110} height={76} style={{ objectFit: 'cover', borderRadius: 6 }} />
                    ))}
                  </Flex>
                )}
              </Image.PreviewGroup>
            ) : (
              <ProjectCover categoryId={p.categoryId} categoryName={t(p.categoryName)} height={200} />
            )}
          </Card>

          <Card title={t('Опис проєкту')} style={{ marginBottom: 24 }}>
            {p.summary && (
              <Typography.Paragraph strong style={{ fontSize: 15 }}>
                {p.summary}
              </Typography.Paragraph>
            )}
            <Typography.Paragraph style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>{p.description ?? '—'}</Typography.Paragraph>
            {docs.length > 0 && (
              <List
                size="small"
                header={t('Документи')}
                dataSource={docs}
                style={{ marginTop: 16 }}
                renderItem={(a) => (
                  <List.Item>
                    <a href={`/api/files/${a.attachmentId}`} target="_blank" rel="noreferrer">
                      <FilePdfOutlined /> {a.fileName}
                    </a>
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Card title={t('Кошторис')} style={{ marginBottom: 24 }}>
            <Table
              size="small"
              rowKey="budgetItemId"
              pagination={false}
              dataSource={p.budgetItems}
              scroll={{ x: 520 }}
              columns={[
                { title: t('Позиція'), dataIndex: 'name' },
                { title: t('Од.'), dataIndex: 'unit', width: 70 },
                { title: t('К-сть'), dataIndex: 'quantity', align: 'right', width: 80 },
                { title: t('Ціна'), dataIndex: 'unitPrice', align: 'right', render: (v: number) => formatMoney(v) },
                { title: t('Сума'), dataIndex: 'amount', align: 'right', render: (v: number) => <b>{formatMoney(v)}</b> },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <b>{t('Разом')}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <b>{formatMoney(p.cost)}</b>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>

          {(isStaff || p.authorId === user?.userId) && p.reviews.length > 0 && (
            <Card title={t('Розгляд проєкту')}>
              <Timeline
                items={p.reviews.map((r) => ({
                  color: r.decision === 'approve' ? 'green' : r.decision === 'reject' ? 'red' : 'orange',
                  children: (
                    <>
                      <b>{t(reviewType[r.reviewType])}</b> — {t(decisionNames[r.decision])}
                      <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                        {r.reviewerName}, {formatDateTime(r.createdAt)}
                      </div>
                      {r.comment && <div>{r.comment}</div>}
                    </>
                  ),
                }))}
              />
            </Card>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <Card style={{ marginBottom: 24 }}>
            <Statistic title={t('Орієнтовна вартість')} value={p.cost} suffix={t('грн')} groupSeparator=" " precision={0} />
            <Row gutter={12} style={{ marginTop: 16 }}>
              <Col span={12}>
                <Statistic title={t('Голоси')} value={p.totalVotes} prefix={<LikeOutlined />} />
              </Col>
              <Col span={12}>
                <Statistic title={t('Виборців')} value={p.voterCount} />
              </Col>
            </Row>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              {t('онлайн')}: {p.onlineVotes} · {t('паперові')}: {p.paperVotes}
            </Typography.Paragraph>
            {canVote && (
              <>
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<PlusOutlined />}
                  loading={voting}
                  onClick={() => void vote()}
                >
                  {t('Голосувати')}
                </Button>
                {ballot && (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                    {t('Ваших голосів за проєкт')}: {myVotes} / {ballot.maxVotesPerProject} · {t('лишилось')}: {ballot.remaining}
                  </Typography.Paragraph>
                )}
              </>
            )}
            {!user && p.status === 'published' && p.campaignStatus === 'voting' && (
              <Button block size="large" onClick={() => navigate('/login', { state: { from: `/projects/${p.projectId}` } })}>
                {t('Увійдіть, щоб голосувати')}
              </Button>
            )}
            {p.implementationId && (
              <Button block icon={<BuildOutlined />} style={{ marginTop: 8 }} onClick={() => navigate(`/implementation/${p.implementationId}`)}>
                {t('Хід реалізації')}
              </Button>
            )}
          </Card>

          <Card title={t('Місце реалізації')} style={{ marginBottom: 24 }} styles={{ body: { padding: 12 } }}>
            {p.latitude != null && p.longitude != null ? (
              <SinglePointMap lat={p.latitude} lng={p.longitude} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Точку на карті не вказано')} />
            )}
            <Typography.Paragraph style={{ margin: '8px 4px 0' }}>{p.address ?? '—'}</Typography.Paragraph>
          </Card>

          <Card title={t('Відомості')}>
            <Descriptions
              column={1}
              size="small"
              items={[
                { label: t('Автор'), children: p.authorName },
                { label: t('Подано'), children: formatDate(p.submittedAt) },
                { label: t('Опубліковано'), children: formatDate(p.publishedAt) },
                ...(p.moderatorName ? [{ label: t('Модератор'), children: p.moderatorName }] : []),
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  )
}
