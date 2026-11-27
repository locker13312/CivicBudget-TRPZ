import { TrophyFilled } from '@ant-design/icons'
import { Alert, Card, Progress, Select, Space, Table, Tabs, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, query } from '../api/client'
import { formatMoney } from '../api/labels'
import { useVotesChanged } from '../api/signalr'
import type { Campaign, RatingResponse, ResultRow, ResultsResponse } from '../api/types'
import { RatingView } from '../components/RatingView'
import { brand } from '../theme'
import { CampaignTag, ExportButton, LoadState, PageTitle, StatusTag, useLoad } from '../components/common'

const WINNERS = ['winner', 'implementing', 'completed']

/** Результати голосування за категоріями; архів минулих кампаній — через вибір кампанії. */
export function ResultsPage() {
  const { t } = useTranslation()
  const [campaignId, setCampaignId] = useState<number | undefined>()
  const campaigns = useLoad(() => api<Campaign[]>('/api/campaigns'), [])
  const res = useLoad(
    () => api<ResultsResponse>(`/api/campaigns/results${query({ campaignId })}`),
    [campaignId],
  )

  useVotesChanged(() => void res.reload())

  const groups = new Map<string, ResultRow[]>()
  for (const r of res.data?.rows ?? []) groups.set(r.categoryName, [...(groups.get(r.categoryName) ?? []), r])
  const c = res.data?.campaign
  const final = !!c && ['implementation', 'closed'].includes(c.status)
  const [rating, setRating] = useState<RatingResponse | null>(null)
  useEffect(() => {
    setRating(null)
    if (c && final)
      api<RatingResponse>(`/api/campaigns/${c.campaignId}/rating`)
        .then(setRating)
        .catch(() => undefined)
  }, [c, final])

  return (
    <>
      <PageTitle
        title={t('Результати голосування')}
        subtitle={t('Лічильники оновлюються в реальному часі')}
        help="results"
        extra={
          <>
            <Select
              style={{ minWidth: 220 }}
              value={campaignId ?? c?.campaignId}
              onChange={setCampaignId}
              options={(campaigns.data ?? []).map((x) => ({ value: x.campaignId, label: x.name }))}
              aria-label={t('Кампанія')}
            />
            <ExportButton
              path={`/api/reports/results${query({ campaignId: c?.campaignId })}`}
              label="Результати"
            />
            <ExportButton
              path={`/api/reports/winners${query({ campaignId: c?.campaignId })}`}
              label="Переможці"
            />
          </>
        }
      />
      <LoadState loading={res.loading && !res.data} error={res.error}>
        {c && (
          <>
            <Space style={{ marginBottom: 16 }} wrap>
              <Typography.Text strong>{c.name}</Typography.Text>
              <CampaignTag status={c.status} />
            </Space>
            {res.data!.votesHidden && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('Проміжні результати приховано до завершення голосування (параметр кампанії).')}
              />
            )}
            {(() => {
              const votes = (
                <>
                  {[...groups.entries()].map(([category, rows]) => {
                    const limit = c.categories.find((x) => x.categoryName === category)?.budgetLimit ?? 0
                    const sorted = [...rows].sort(
                      (a, b) => b.totalVotes - a.totalVotes || b.voterCount - a.voterCount,
                    )
                    const max = Math.max(1, ...sorted.map((r) => r.totalVotes))
                    return (
                      <Card
                        key={category}
                        title={t(category)}
                        extra={
                          <Typography.Text type="secondary">
                            {t('Ліміт')}: {formatMoney(limit)}
                          </Typography.Text>
                        }
                        style={{ marginBottom: 20 }}
                      >
                        <Table
                          size="small"
                          rowKey="projectId"
                          pagination={false}
                          dataSource={sorted}
                          scroll={{ x: 760 }}
                          rowClassName={(r) => (WINNERS.includes(r.status) ? 'row-winner' : '')}
                          columns={[
                            {
                              title: '#',
                              width: 48,
                              render: (_, r, i) =>
                                WINNERS.includes(r.status) ? (
                                  <TrophyFilled style={{ color: brand.accent }} />
                                ) : (
                                  i + 1
                                ),
                            },
                            {
                              title: t('Проєкт'),
                              render: (_, r) => (
                                <>
                                  <Link to={`/projects/${r.projectId}`}>{r.title}</Link>
                                  <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                                    {r.regNumber} · {t(r.districtName)}
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
                            {
                              title: t('Голоси'),
                              width: 220,
                              render: (_, r) => (
                                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                                  <Progress
                                    percent={Math.round((r.totalVotes / max) * 100)}
                                    format={() => r.totalVotes}
                                    size="small"
                                  />
                                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                                    {t('онлайн')} {r.onlineVotes} · {t('папір')} {r.paperVotes} ·{' '}
                                    {t('виборців')} {r.voterCount}
                                  </span>
                                </Space>
                              ),
                            },
                            {
                              title: t('Статус'),
                              dataIndex: 'status',
                              width: 140,
                              render: (s: string) => <StatusTag status={s} />,
                            },
                          ]}
                        />
                      </Card>
                    )
                  })}
                </>
              )
              return rating ? (
                <Tabs
                  items={[
                    { key: 'votes', label: t('Голоси за категоріями'), children: votes },
                    {
                      key: 'rating',
                      label: t('Відбір переможців'),
                      children: (
                        <Card>
                          <RatingView rating={rating} />
                        </Card>
                      ),
                    },
                  ]}
                />
              ) : (
                votes
              )
            })()}
          </>
        )}
      </LoadState>
    </>
  )
}
