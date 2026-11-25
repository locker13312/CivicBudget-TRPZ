import { Link } from 'react-router-dom'
import { campaignStatusOrder, formatDate, formatMoney, votesWord } from '../api/labels'
import type { Campaign, PagedResult, ProjectListItem } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Alert, CampaignBadge, Loading, StatusBadge, useApi } from '../components/ui'

const stages = [
  { key: 'submission', title: 'Подання проєктів', from: 'submissionStart', to: 'submissionEnd' },
  { key: 'review', title: 'Розгляд і експертиза', from: 'submissionEnd', to: 'reviewEnd' },
  { key: 'voting', title: 'Голосування', from: 'votingStart', to: 'votingEnd' },
  { key: 'counting', title: 'Підрахунок і переможці', from: 'votingEnd', to: 'resultsDate' },
  { key: 'implementation', title: 'Реалізація', from: 'resultsDate', to: null },
] as const

export function HomePage() {
  const { hasRole } = useAuth()
  const { data: campaign, error, loading } = useApi<Campaign>('/api/campaigns/current')
  const top = useApi<PagedResult<ProjectListItem>>(
    campaign ? `/api/projects?campaignId=${campaign.campaignId}&sort=votes&pageSize=3` : null,
    [campaign?.campaignId],
  )

  if (loading) return <Loading />
  if (error || !campaign) return <Alert>{error ?? 'Активної кампанії немає.'}</Alert>

  const currentIndex = campaignStatusOrder.indexOf(campaign.status)

  return (
    <>
      <section className="hero">
        <div>
          <CampaignBadge status={campaign.status} />
          <h1>{campaign.name}</h1>
          <p>
            Мешканці пропонують ідеї для свого міста, а потім голосують за найкращі. Переможці реалізуються
            коштом міського бюджету.
          </p>
          <div className="actions">
            <Link to="/projects" className="btn btn-primary">
              Переглянути проєкти
            </Link>
            {campaign.status === 'voting' && (
              <Link to={hasRole('resident') ? '/voting' : '/login'} className="btn btn-accent">
                Голосувати
              </Link>
            )}
            <Link to="/results" className="btn btn-light">
              Результати
            </Link>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <b>{formatMoney(campaign.totalBudget)}</b>
            <span>загальний бюджет</span>
          </div>
          <div>
            <b>
              {formatMoney(campaign.minProjectCost)} – {formatMoney(campaign.maxProjectCost)}
            </b>
            <span>вартість одного проєкту</span>
          </div>
          <div>
            <b>{votesWord(campaign.votesPerVoter)}</b>
            <span>у кожного виборця, до {campaign.maxVotesPerProject} за проєкт</span>
          </div>
          <div>
            <b>з {campaign.minVoterAge} років</b>
            <span>можна голосувати</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Етапи кампанії</h2>
        <ol className="timeline">
          {stages.map((s) => {
            const idx = campaignStatusOrder.indexOf(s.key)
            const state = idx < currentIndex ? 'done' : idx === currentIndex ? 'active' : 'future'
            return (
              <li key={s.key} className={`stage stage-${state}`}>
                <span className="stage-dot">{state === 'done' ? '✓' : idx}</span>
                <b>{s.title}</b>
                <small>
                  {formatDate(campaign[s.from])}
                  {s.to ? ` – ${formatDate(campaign[s.to])}` : ''}
                </small>
                {state === 'active' && <em>триває зараз</em>}
              </li>
            )
          })}
        </ol>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Ліміти категорій</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Категорія</th>
                <th className="num">Ліміт</th>
              </tr>
            </thead>
            <tbody>
              {campaign.categories.map((c) => (
                <tr key={c.categoryId}>
                  <td>{c.categoryName}</td>
                  <td className="num">{formatMoney(c.budgetLimit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Лідери голосування</h2>
          {top.data?.items.length ? (
            <ul className="list">
              {top.data.items.map((p, i) => (
                <li key={p.projectId}>
                  <span className="place">{i + 1}</span>
                  <div>
                    <Link to={`/projects/${p.projectId}`}>{p.title}</Link>
                    <small className="muted">
                      {p.categoryName} · {p.districtName} · {formatMoney(p.cost)}
                    </small>
                  </div>
                  <b className="votes">{votesWord(p.totalVotes)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Опублікованих проєктів ще немає.</p>
          )}
          {top.data?.items[0] && (
            <p className="muted small">
              Статус лідера: <StatusBadge status={top.data.items[0].status} />
            </p>
          )}
        </section>
      </div>
    </>
  )
}
