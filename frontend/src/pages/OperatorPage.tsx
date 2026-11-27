import { FileDoneOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Flex,
  Input,
  InputNumber,
  List,
  Result,
  Row,
  Select,
  Statistic,
  Table,
  Tag,
} from 'antd'
import type { Dayjs } from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { formatDate, formatMoney, verificationNames, votesWord } from '../api/labels'
import type { Campaign, PagedResult, ProjectListItem, References, VoterStatus } from '../api/types'

const ageOf = (birth: string | null) => {
  if (!birth) return null
  const b = new Date(birth)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--
  return age
}
import { LoadState, NoCampaign, PageTitle, useLoad } from '../components/common'

/** Оператор пункту голосування: внесення паперового бюлетеня (виборець, пункт, проєкти й кількість голосів). */
export function OperatorPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const base = useLoad(async () => {
    const campaign = await api<Campaign>('/api/campaigns/current').catch(() => null)
    if (!campaign) return null
    return {
      campaign,
      refs: await api<References>('/api/reference'),
      projects: await api<PagedResult<ProjectListItem>>(
        `/api/projects?campaignId=${campaign.campaignId}&status=published&pageSize=100&sort=title`,
      ),
    }
  }, [])
  const [name, setName] = useState('')
  const [birth, setBirth] = useState<Dayjs | null>(null)
  const [voters, setVoters] = useState<VoterStatus[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [voter, setVoter] = useState<VoterStatus | null>(null)
  const [station, setStation] = useState<number | undefined>()
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // пошук за ПІБ і датою народження (ПЦ-14): однофамільців розрізняє дата
  const searchVoters = async () => {
    if (name.trim().length < 2) return
    setSearching(true)
    setVoter(null)
    try {
      const q = new URLSearchParams({ name: name.trim() })
      if (birth) q.set('birthDate', birth.format('YYYY-MM-DD'))
      setVoters(await api<VoterStatus[]>(`/api/operator/voters?${q}`))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const c = base.data?.campaign
  const age = voter ? ageOf(voter.birthDate) : null
  // ДП-08: виборець, який уже голосував онлайн або використав усі голоси, бюлетень не подає
  const blockReason = !voter
    ? null
    : voter.channel === 'online'
      ? t('Виборець уже голосував онлайн у цій кампанії. Паперовий бюлетень не приймається.')
      : voter.channel === 'paper' && voter.remaining === 0
        ? t('Виборець уже подав паперовий бюлетень і використав усі голоси.')
        : voter.isBlocked
          ? t('Обліковий запис виборця заблоковано.')
          : voter.verificationStatus !== 'verified'
            ? t('Особу виборця не верифіковано.')
            : c && age != null && age < c.minVoterAge
              ? t('Виборцю ще немає {{n}} років.', { n: c.minVoterAge })
              : null
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
      setDone(`${t(r.message)} ${t('Виборець')}: ${voter.fullName}.`)
      message.success(t(r.message))
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
    setVoters(null)
    setName('')
    setBirth(null)
    setError(null)
  }

  return (
    <>
      <PageTitle title={t('Паперовий бюлетень')} subtitle={c?.name} help="operator" />
      <LoadState loading={base.loading} error={base.error}>
        {!base.loading && !base.data ? (
          <NoCampaign />
        ) : done ? (
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
                  <Flex vertical gap={8}>
                    <Input
                      size="large"
                      placeholder={t('Прізвище та ім’я')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onPressEnter={() => void searchVoters()}
                      allowClear
                    />
                    <Flex gap={8}>
                      <DatePicker
                        size="large"
                        format="DD.MM.YYYY"
                        placeholder={t('Дата народження')}
                        value={birth}
                        onChange={setBirth}
                        style={{ flex: 1 }}
                      />
                      <Button
                        size="large"
                        type="primary"
                        icon={<SearchOutlined />}
                        loading={searching}
                        disabled={name.trim().length < 2}
                        onClick={() => void searchVoters()}
                      >
                        {t('Знайти')}
                      </Button>
                    </Flex>
                  </Flex>
                  {voters && !voter && (
                    <List
                      size="small"
                      bordered
                      style={{ marginTop: 12 }}
                      dataSource={voters}
                      locale={{ emptyText: t('Виборця не знайдено. Перевірте ПІБ і дату народження.') }}
                      renderItem={(v) => (
                        <List.Item
                          style={{ cursor: 'pointer' }}
                          onClick={() => setVoter(v)}
                          actions={[
                            v.channel ? (
                              <Tag key="ch" color={v.channel === 'online' ? 'red' : 'orange'}>
                                {v.channel === 'online' ? t('голосував онлайн') : t('паперовий бюлетень')}
                              </Tag>
                            ) : (
                              <Tag key="ch" color="green">
                                {t('не голосував')}
                              </Tag>
                            ),
                          ]}
                        >
                          <List.Item.Meta
                            title={v.fullName}
                            description={`${formatDate(v.birthDate)}${v.districtName ? ' · ' + t(v.districtName) : ''}`}
                          />
                        </List.Item>
                      )}
                    />
                  )}
                  {voter && (
                    <>
                      <Descriptions
                        size="small"
                        column={1}
                        style={{ marginTop: 16 }}
                        bordered
                        items={[
                          { label: t('ПІБ'), children: voter.fullName },
                          {
                            label: t('Дата народження'),
                            children: `${formatDate(voter.birthDate)}${age != null ? ` (${age})` : ''}`,
                          },
                          {
                            label: t('Верифікація'),
                            children: (
                              <Tag color={voter.verificationStatus === 'verified' ? 'green' : 'orange'}>
                                {t(verificationNames[voter.verificationStatus] ?? voter.verificationStatus)}
                              </Tag>
                            ),
                          },
                          { label: t('Район'), children: voter.districtName ? t(voter.districtName) : '—' },
                          {
                            label: t('Голосування'),
                            children: voter.channel
                              ? `${voter.channel === 'online' ? t('онлайн') : t('паперовий бюлетень')} · ${t('лишилось')} ${votesWord(voter.remaining)}`
                              : `${t('ще не голосував')} · ${votesWord(voter.remaining)}`,
                          },
                        ]}
                      />
                      {blockReason ? (
                        <Alert type="error" showIcon style={{ marginTop: 12 }} message={blockReason} />
                      ) : (
                        <Alert
                          type="success"
                          showIcon
                          style={{ marginTop: 12 }}
                          message={t('Виборець може проголосувати: {{n}}.', {
                            n: votesWord(voter.remaining),
                          })}
                        />
                      )}
                      <Button type="link" style={{ paddingInline: 0 }} onClick={() => setVoter(null)}>
                        {t('Обрати іншого виборця')}
                      </Button>
                    </>
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
                      'Вік, верифікацію, ліміти голосів і те, що виборець не голосував онлайн, система перевіряє під час внесення.',
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
                    disabled={!voter || !!blockReason || !station || total === 0}
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
