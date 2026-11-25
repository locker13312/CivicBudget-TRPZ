import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../api/labels'
import { useVotesChanged } from '../api/signalr'
import type { Campaign, ResultRow, ResultsResponse } from '../api/types'
import {
  Alert,
  CampaignBadge,
  Empty,
  Field,
  Loading,
  PageHeader,
  StatusBadge,
  useApi,
} from '../components/ui'

/** Результати голосування за категоріями (уявлення vw_ProjectResult), оновлюються наживо через SignalR. */
export function ResultsPage() {
  const campaigns = useApi<Campaign[]>('/api/campaigns')
  const [campaignId, setCampaignId] = useState<string>('')
  const id = campaignId || String(campaigns.data?.[0]?.campaignId ?? '')
  const { data, error, loading, reload } = useApi<ResultsResponse>(
    id ? `/api/campaigns/results?campaignId=${id}` : null,
    [id],
  )
  useVotesChanged(() => reload())

  const groups = new Map<string, ResultRow[]>()
  data?.rows.forEach((r) => groups.set(r.categoryName, [...(groups.get(r.categoryName) ?? []), r]))

  return (
    <>
      <PageHeader
        title="Результати голосування"
        subtitle={
          data && (
            <>
              {data.campaign.name} · <CampaignBadge status={data.campaign.status} />
            </>
          )
        }
        actions={
          <Field label="Кампанія">
            <select value={id} onChange={(e) => setCampaignId(e.target.value)}>
              {campaigns.data?.map((c) => (
                <option key={c.campaignId} value={c.campaignId}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        }
      />
      <Alert>{error}</Alert>
      {data?.votesHidden && (
        <Alert kind="info">Проміжні результати приховано до завершення голосування.</Alert>
      )}
      {data?.campaign.status === 'voting' && !data.votesHidden && (
        <Alert kind="info">
          Голосування триває — це проміжні результати, вони оновлюються в реальному часі.
        </Alert>
      )}
      {loading && !data ? (
        <Loading />
      ) : groups.size === 0 ? (
        <Empty>У цій кампанії ще немає опублікованих проєктів.</Empty>
      ) : (
        [...groups.entries()].map(([category, rows]) => {
          const limit = data!.campaign.categories.find((c) => c.categoryName === category)?.budgetLimit ?? 0
          const max = Math.max(1, ...rows.map((r) => r.totalVotes))
          return (
            <section className="card" key={category}>
              <div className="section-title">
                <h2>{category}</h2>
                <span className="muted">ліміт категорії: {formatMoney(limit)}</span>
              </div>
              <table className="table results">
                <thead>
                  <tr>
                    <th>Місце</th>
                    <th>Проєкт</th>
                    <th>Район</th>
                    <th className="num">Вартість</th>
                    <th style={{ width: '28%' }}>Голоси (онлайн / паперові)</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.projectId}
                      className={
                        r.status === 'winner' || r.status === 'implementing' || r.status === 'completed'
                          ? 'row-win'
                          : ''
                      }
                    >
                      <td>{i + 1}</td>
                      <td>
                        <Link to={`/projects/${r.projectId}`}>{r.title}</Link>
                        <small className="muted block">{r.regNumber}</small>
                      </td>
                      <td>{r.districtName}</td>
                      <td className="num">{formatMoney(r.cost)}</td>
                      <td>
                        <div className="bar">
                          <span style={{ width: `${(r.totalVotes / max) * 100}%` }} />
                        </div>
                        <b>{r.totalVotes}</b>{' '}
                        <small className="muted">
                          ({r.onlineVotes} / {r.paperVotes}), виборців: {r.voterCount}
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })
      )}
    </>
  )
}
