import { CheckCircleFilled, LikeFilled, PlusOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Progress,
  Rate,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { formatMoney } from '../api/labels'
import { useVotesChanged } from '../api/signalr'
import type { BallotProject, MyBallot } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { LoadState, PageTitle, useLoad } from '../components/common'

/**
 * Онлайн-голосування: 5 голосів на виборця, до 2 за проєкт. Правила перевіряє тригер TR_Vote_CheckRules у БД —
 * сторінка лише показує його повідомлення зрозумілою мовою.
 */
export function VotingPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { user } = useAuth()
  const { data, setData, loading, error, reload } = useLoad(() => api<MyBallot>('/api/voting/my'), [])
  const [busy, setBusy] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | undefined>()

  useVotesChanged(() => void reload())

  const vote = async (p: BallotProject) => {
    setBusy(p.projectId)
    setLastError(null)
    try {
      const b = await api<MyBallot>(`/api/voting/${p.projectId}`, { method: 'POST' })
      setData(b)
      message.success(
        t('Голос за «{{title}}» враховано. Лишилось: {{n}}', { title: p.title, n: b.remaining }),
      )
    } catch (e) {
      setLastError((e as Error).message)
      message.error((e as Error).message, 6)
    } finally {
      setBusy(null)
    }
  }

  const projects = useMemo(
    () =>
      (data?.projects ?? []).filter(
        (p) =>
          (!category || p.categoryName === category) &&
          (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.regNumber?.includes(search)),
      ),
    [data, search, category],
  )
  const categories = [...new Set((data?.projects ?? []).map((p) => p.categoryName))]
  const mine = (data?.projects ?? []).filter((p) => p.myVotes > 0)

  return (
    <>
      <PageTitle title={t('Голосування')} subtitle={data?.campaign?.name} help="voting" />
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            {!data.votingOpen && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('Голосування зараз не триває.')}
              />
            )}
            {user?.verificationStatus !== 'verified' && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('Ваш обліковий запис не верифіковано — голос не буде прийнято.')}
              />
            )}
            {data.channel === 'paper' && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t(
                  'Ви вже проголосували паперовим бюлетенем. Онлайн-голосування в цій кампанії недоступне.',
                )}
              />
            )}
            {lastError && (
              <Alert
                type="error"
                showIcon
                closable
                style={{ marginBottom: 16 }}
                message={lastError}
                onClose={() => setLastError(null)}
              />
            )}

            <Row gutter={[24, 24]}>
              <Col xs={24} lg={8}>
                <Card style={{ position: 'sticky', top: 80 }}>
                  <Statistic
                    title={t('Лишилось голосів')}
                    value={data.remaining}
                    suffix={`/ ${data.votesPerVoter}`}
                    valueStyle={{ color: data.remaining > 0 ? '#1f5c99' : '#8c8c8c', fontSize: 40 }}
                  />
                  <Progress
                    percent={Math.round((data.used / data.votesPerVoter) * 100)}
                    steps={data.votesPerVoter}
                    showInfo={false}
                    strokeColor="#1f5c99"
                    size={[40, 10]}
                    style={{ margin: '8px 0 16px' }}
                  />
                  <Typography.Paragraph type="secondary">
                    {t('Не більше {{n}} голосів за один проєкт.', { n: data.maxVotesPerProject })}
                  </Typography.Paragraph>
                  <Typography.Title level={5}>{t('Мій вибір')}</Typography.Title>
                  {mine.length === 0 ? (
                    <Typography.Text type="secondary">{t('Ви ще не голосували.')}</Typography.Text>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {mine.map((p) => (
                        <Flex key={p.projectId} justify="space-between" gap={8}>
                          <Link to={`/projects/${p.projectId}`} style={{ flex: 1 }}>
                            {p.title}
                          </Link>
                          <Rate
                            disabled
                            count={data.maxVotesPerProject}
                            value={p.myVotes}
                            character={<LikeFilled />}
                            style={{ fontSize: 14 }}
                          />
                        </Flex>
                      ))}
                    </Space>
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={16}>
                <Card>
                  <Flex gap={12} wrap style={{ marginBottom: 16 }}>
                    <Input.Search
                      allowClear
                      placeholder={t('Пошук за назвою або номером')}
                      onSearch={setSearch}
                      onChange={(e) => !e.target.value && setSearch('')}
                      style={{ maxWidth: 320 }}
                    />
                    <Select
                      allowClear
                      placeholder={t('Категорія')}
                      value={category}
                      onChange={setCategory}
                      options={categories.map((c) => ({ value: c, label: t(c) }))}
                      style={{ minWidth: 180 }}
                    />
                  </Flex>
                  <Table
                    rowKey="projectId"
                    dataSource={projects}
                    pagination={false}
                    scroll={{ x: 680 }}
                    locale={{ emptyText: <Empty description={t('Проєктів для голосування немає')} /> }}
                    columns={[
                      {
                        title: t('Проєкт'),
                        render: (_, p) => (
                          <>
                            <Link to={`/projects/${p.projectId}`}>
                              <b>{p.title}</b>
                            </Link>
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
                        width: 120,
                        render: (v: number) => formatMoney(v),
                      },
                      { title: t('Голоси'), dataIndex: 'totalVotes', align: 'right', width: 80 },
                      {
                        title: t('Мої'),
                        width: 90,
                        render: (_, p) =>
                          p.myVotes > 0 ? (
                            <span style={{ color: '#2e7d32', fontWeight: 600 }}>
                              <CheckCircleFilled /> {p.myVotes}
                            </span>
                          ) : (
                            '—'
                          ),
                      },
                      {
                        title: '',
                        width: 110,
                        render: (_, p) => (
                          <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            loading={busy === p.projectId}
                            disabled={!data.votingOpen || data.channel === 'paper'}
                            onClick={() => void vote(p)}
                          >
                            {t('Голос')}
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Card>
              </Col>
            </Row>
          </>
        )}
      </LoadState>
    </>
  )
}
