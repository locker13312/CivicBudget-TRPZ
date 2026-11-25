import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { decisionNames, formatDate, formatDateTime, formatMoney, reviewType, votesWord } from '../api/labels'
import { useVotesChanged } from '../api/signalr'
import type { MyBallot, ProjectDetails } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Alert, Loading, StatusBadge, useApi } from '../components/ui'
import { ExpertPanel, ModerationPanel } from './ReviewPanels'

/** Картка проєкту: опис, кошторис, вартість, статус, голоси; голосування, підписка; панелі модератора й експерта. */
export function ProjectPage() {
  const { id } = useParams()
  const { user, hasRole } = useAuth()
  const { data: p, error, loading, reload } = useApi<ProjectDetails>(`/api/projects/${id}`, [id])
  const ballot = useApi<MyBallot>(hasRole('resident') ? '/api/voting/my' : null, [user?.userId])
  const sub = useApi<{ subscribed: boolean }>(user ? `/api/projects/${id}/subscription` : null, [
    id,
    user?.userId,
  ])
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewMessage, setReviewMessage] = useState<string | null>(null)

  // після рішення модератора чи експерта статус змінюється і панель може зникнути — повідомлення показуємо на сторінці
  function afterReview(text: string) {
    setReviewMessage(text)
    reload()
  }

  useVotesChanged((projectId) => {
    if (projectId === 0 || projectId === Number(id)) reload()
  })

  if (loading && !p) return <Loading />
  if (error || !p) return <Alert>{error ?? 'Проєкт не знайдено.'}</Alert>

  const myVotes = ballot.data?.projects.find((b) => b.projectId === p.projectId)?.myVotes ?? 0
  const canVote = p.status === 'published' && p.campaignStatus === 'voting'
  const showReviews = user && (user.userId === p.authorId || hasRole('moderator', 'expert', 'admin'))

  async function vote() {
    setBusy(true)
    setMessage(null)
    try {
      const b = await api<MyBallot>(`/api/voting/${p!.projectId}`, { method: 'POST' })
      ballot.setData(b)
      setMessage({ kind: 'success', text: `Голос зараховано! У вас лишилось ${votesWord(b.remaining)}.` })
      reload()
    } catch (e) {
      // помилки тригера TR_Vote_CheckRules (50001–50005) приходять уже зрозумілим текстом
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function toggleSubscription() {
    const subscribed = sub.data?.subscribed
    const r = await api<{ subscribed: boolean }>(`/api/projects/${p!.projectId}/subscription`, {
      method: subscribed ? 'DELETE' : 'PUT',
    })
    sub.setData(r)
  }

  return (
    <>
      {reviewMessage && <Alert kind="success">{reviewMessage}</Alert>}
      <p className="breadcrumbs">
        <Link to="/projects">Проєкти</Link> / {p.regNumber ?? 'чернетка'}
      </p>
      <div className="project-layout">
        <article className="card">
          <div className="project-card-top">
            <span className="chip">{p.categoryName}</span>
            <StatusBadge status={p.status} />
          </div>
          <h1>{p.title}</h1>
          {p.summary && <p className="lead">{p.summary}</p>}

          <dl className="props">
            <dt>Номер</dt>
            <dd>{p.regNumber ?? '—'}</dd>
            <dt>Кампанія</dt>
            <dd>{p.campaignName}</dd>
            <dt>Район</dt>
            <dd>{p.districtName}</dd>
            <dt>Адреса</dt>
            <dd>{p.address ?? '—'}</dd>
            <dt>Автор</dt>
            <dd>{p.authorName}</dd>
            <dt>Подано</dt>
            <dd>{formatDate(p.submittedAt)}</dd>
            <dt>Опубліковано</dt>
            <dd>{formatDate(p.publishedAt)}</dd>
          </dl>

          <h2>Опис</h2>
          <p className="description">{p.description ?? 'Опис ще не заповнено.'}</p>

          <h2>Кошторис</h2>
          <table className="table">
            <thead>
              <tr>
                <th>№</th>
                <th>Позиція</th>
                <th>Од.</th>
                <th className="num">Кількість</th>
                <th className="num">Ціна</th>
                <th className="num">Сума</th>
              </tr>
            </thead>
            <tbody>
              {p.budgetItems.map((b, i) => (
                <tr key={b.budgetItemId}>
                  <td>{i + 1}</td>
                  <td>{b.name}</td>
                  <td>{b.unit}</td>
                  <td className="num">{b.quantity}</td>
                  <td className="num">{formatMoney(b.unitPrice)}</td>
                  <td className="num">{formatMoney(b.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Разом (вартість проєкту)</td>
                <td className="num">
                  <b>{formatMoney(p.cost)}</b>
                </td>
              </tr>
            </tfoot>
          </table>

          {showReviews && p.reviews.length > 0 && (
            <>
              <h2>Історія розгляду</h2>
              <ul className="reviews">
                {p.reviews.map((r) => (
                  <li key={r.reviewId} className={`review review-${r.decision}`}>
                    <div>
                      <b>{reviewType[r.reviewType]}</b> — {decisionNames[r.decision]}
                      <small className="muted">
                        {' '}
                        · {r.reviewerName} · {formatDateTime(r.createdAt)}
                      </small>
                    </div>
                    {r.comment && <p>{r.comment}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>

        <aside>
          <div className="card vote-box">
            <div className="big-number">{p.totalVotes}</div>
            <div className="muted">
              {votesWord(p.totalVotes).replace(/^\d+ /, '')} від {p.voterCount} виборців
            </div>
            <div className="split">
              <span>онлайн: {p.onlineVotes}</span>
              <span>паперові: {p.paperVotes}</span>
            </div>
            <div className="cost-line">
              Вартість: <b>{formatMoney(p.cost)}</b>
            </div>

            {canVote && hasRole('resident') && ballot.data && (
              <>
                <p className="muted small">
                  Ваших голосів за цей проєкт: <b>{myVotes}</b>. Лишилось у кампанії:{' '}
                  <b>{ballot.data.remaining}</b> з {ballot.data.votesPerVoter}.
                </p>
                <button className="btn btn-accent btn-block" disabled={busy} onClick={vote}>
                  {myVotes === 0 ? 'Підтримати проєкт' : 'Віддати ще один голос'}
                </button>
              </>
            )}
            {canVote && !user && (
              <Link to="/login" className="btn btn-accent btn-block">
                Увійдіть, щоб проголосувати
              </Link>
            )}
            {message && <Alert kind={message.kind}>{message.text}</Alert>}

            {user && sub.data && (
              <button className="btn btn-light btn-block" onClick={toggleSubscription}>
                {sub.data.subscribed ? '✓ Ви підписані на оновлення' : '🔔 Підписатися на оновлення'}
              </button>
            )}
          </div>

          {hasRole('moderator') && ['submitted', 'moderation'].includes(p.status) && (
            <ModerationPanel project={p} onDone={afterReview} />
          )}
          {hasRole('expert') && p.status === 'expertise' && <ExpertPanel project={p} onDone={afterReview} />}
        </aside>
      </div>
    </>
  )
}
