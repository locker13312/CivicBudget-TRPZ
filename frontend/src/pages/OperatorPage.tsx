import { FileDoneOutlined, UserOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  InputNumber,
  Result,
  Row,
  Select,
  Spin,
  Statistic,
  Table,
  Tag,
} from 'antd'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { formatDate, formatMoney, verificationNames } from '../api/labels'
import type { Campaign, PagedResult, ProjectListItem, References, UserRow } from '../api/types'
import { LoadState, PageTitle, useLoad } from '../components/common'

/** Оператор пункту голосування: внесення паперового бюлетеня (виборець, пункт, проєкти й кількість голосів). */
export function OperatorPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const base = useLoad(async () => {
    const campaign = await api<Campaign>('/api/campaigns/current')
    return {
      campaign,
      refs: await api<References>('/api/reference'),
      projects: await api<PagedResult<ProjectListItem>>(
        `/api/projects?campaignId=${campaign.campaignId}&status=published&pageSize=100&sort=title`,
      ),
    }
  }, [])
  const [voters, setVoters] = useState<UserRow[]>([])
  const [searching, setSearching] = useState(false)
  const [voter, setVoter] = useState<UserRow | null>(null)
  const [station, setStation] = useState<number | undefined>()
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const searchVoters = (q: string) => {
    clearTimeout(timer.current)
    if (q.trim().length < 2) return
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        setVoters(await api<UserRow[]>(`/api/operator/voters?q=${encodeURIComponent(q.trim())}`))
      } finally {
        setSearching(false)
      }
    }, 350)
  }

  const c = base.data?.campaign
  const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0)

  const submit = async () => {
    if (!voter || !station) return
    setBusy(true)
    setError(null)
    try {
      const items = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([projectId, count]) => ({ projectId: Number(projectId), count }))
      const r = await api<{ message: string }>('/api/operator/ballots', {
        method: 'POST',
        body: { voterId: voter.userId, stationId: station, items },
      })
      setDone(`${r.message} ${t('Виборець')}: ${voter.fullName}.`)
      message.success(r.message)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setDone(null)
    setVoter(null)
    setCounts({})
    setVoters([])
    setError(null)
  }

  return (
    <>
      <PageTitle title={t('Паперовий бюлетень')} subtitle={c?.name} help="operator" />
      <LoadState loading={base.loading} error={base.error}>
        {done ? (
          <Card>
            <Result
              status="success"
              title={t('Бюлетень внесено')}
              subTitle={done}
              extra={
                <Button type="primary" onClick={reset}>
                  {t('Наступний бюлетень')}
                </Button>
              }
            />
          </Card>
        ) : (
          base.data && (
            <Row gutter={[24, 24]}>
              <Col xs={24} lg={9}>
                <Card title={t('1. Виборець і пункт голосування')}>
                  <Select
                    showSearch
                    style={{ width: '100%' }}
                    size="large"
                    placeholder={t('Прізвище, ім’я, e-mail або номер')}
                    filterOption={false}
                    onSearch={searchVoters}
                    notFoundContent={searching ? <Spin size="small" /> : null}
                    value={voter?.userId}
                    onChange={(id) => setVoter(voters.find((v) => v.userId === id) ?? null)}
                    options={voters.map((v) => ({ value: v.userId, label: `${v.fullName} (#${v.userId})` }))}
                    suffixIcon={<UserOutlined />}
                  />
                  {voter && (
                    <Descriptions
                      size="small"
                      column={1}
                      style={{ marginTop: 16 }}
                      bordered
                      items={[
                        { label: t('ПІБ'), children: voter.fullName },
                        { label: t('Дата народження'), children: formatDate(voter.birthDate) },
                        {
                          label: t('Верифікація'),
                          children: (
                            <Tag color={voter.verificationStatus === 'verified' ? 'green' : 'orange'}>
                              {t(verificationNames[voter.verificationStatus] ?? voter.verificationStatus)}
                            </Tag>
                          ),
                        },
                        { label: t('Район'), children: voter.districtName ? t(voter.districtName) : '—' },
                      ]}
                    />
                  )}
                  <Select
                    style={{ width: '100%', marginTop: 16 }}
                    size="large"
                    placeholder={t('Пункт голосування')}
                    value={station}
                    onChange={setStation}
                    options={base.data.refs.stations.map((s) => ({ value: s.id, label: s.name }))}
                  />
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginTop: 16 }}
                    message={t(
                      'Перевірки (вік, верифікація, ліміти, один спосіб голосування) виконує база даних.',
                    )}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={15}>
                <Card
                  title={t('2. Позначки в бюлетені')}
                  extra={
                    <Statistic value={total} suffix={`/ ${c!.votesPerVoter}`} valueStyle={{ fontSize: 18 }} />
                  }
                >
                  {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
                  <Table
                    rowKey="projectId"
                    size="small"
                    pagination={false}
                    dataSource={base.data.projects.items}
                    scroll={{ x: 560 }}
                    locale={{ emptyText: <Empty description={t('Немає опублікованих проєктів')} /> }}
                    columns={[
                      {
                        title: t('Проєкт'),
                        render: (_, p) => (
                          <>
                            <b>{p.title}</b>
                            <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                              {p.regNumber} · {t(p.categoryName)}
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
                      {
                        title: t('Голосів'),
                        width: 110,
                        render: (_, p) => (
                          <InputNumber
                            min={0}
                            max={c!.maxVotesPerProject}
                            value={counts[p.projectId] ?? 0}
                            onChange={(v) => setCounts((x) => ({ ...x, [p.projectId]: Number(v) || 0 }))}
                            style={{ width: 80 }}
                          />
                        ),
                      },
                    ]}
                  />
                  <Button
                    type="primary"
                    size="large"
                    icon={<FileDoneOutlined />}
                    style={{ marginTop: 16 }}
                    disabled={!voter || !station || total === 0}
                    loading={busy}
                    onClick={() => void submit()}
                  >
                    {t('Внести бюлетень')}
                  </Button>
                </Card>
              </Col>
            </Row>
          )
        )}
      </LoadState>
    </>
  )
}
