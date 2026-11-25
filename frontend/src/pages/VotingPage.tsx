import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { formatDate, formatMoney, votesWord } from '../api/labels'
import { useVotesChanged } from '../api/signalr'
import type { MyBallot } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Alert, Empty, Loading, PageHeader, useApi } from '../components/ui'

/**
 * Онлайн-голосування мешканця: розподіл 5 голосів (до 2 на проєкт), лічильник залишку.
 * Правила перевіряє тригер БД; його помилки показуються зрозумілим повідомленням.
 */
export function VotingPage() {
  const { user } = useAuth()
  const { data, error, loading, setData, reload } = useApi<MyBallot>('/api/voting/my')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  useVotesChanged(() => reload())

  async function vote(projectId: number, title: string) {
    setBusy(projectId)
    setMsg(null)
    try {
      const b = await api<MyBallot>(`/api/voting/${projectId}`, { method: 'POST' })
      setData(b)
      setMsg({
        kind: 'success',
        text: `Голос за «${title}» зараховано. Лишилось: ${votesWord(b.remaining)}.`,
      })
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <Alert>{error}</Alert>
  if (!data.campaign) return <Empty>Активної кампанії немає.</Empty>

  return (
    <>
      <PageHeader
        title="Голосування"
        subtitle={`${data.campaign.name} · голосування триває ${formatDate(data.campaign.votingStart)} – ${formatDate(data.campaign.votingEnd)}`}
      />

      {user?.verificationStatus !== 'verified' && (
        <Alert kind="info">Ваш обліковий запис ще не верифіковано — голос не буде зараховано.</Alert>
      )}
      {!data.votingOpen && <Alert kind="info">Етап голосування зараз не триває.</Alert>}

      <div className="ballot-summary card">
        <div>
          <span className="muted">Використано</span>
          <b>{data.used}</b>
        </div>
        <div className="vote-dots" aria-label={`Лишилось ${data.remaining} з ${data.votesPerVoter}`}>
          {Array.from({ length: data.votesPerVoter }, (_, i) => (
            <span key={i} className={i < data.used ? 'dot used' : 'dot'} />
          ))}
        </div>
        <div>
          <span className="muted">Лишилось</span>
          <b className="accent">{data.remaining}</b>
        </div>
        <p className="muted small">
          У вас {votesWord(data.votesPerVoter)}; за один проєкт — не більше {data.maxVotesPerProject}. Віддані
          голоси скасувати не можна.
          {data.channel === 'paper' && ' Ви вже голосували паперовим бюлетенем.'}
        </p>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {data.projects.length === 0 ? (
        <Empty>Опублікованих проєктів немає.</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Проєкт</th>
                <th>Категорія</th>
                <th className="num">Вартість</th>
                <th className="num">Усього голосів</th>
                <th className="center">Мої голоси</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.projectId} className={p.myVotes > 0 ? 'row-mine' : ''}>
                  <td>
                    <Link to={`/projects/${p.projectId}`}>{p.title}</Link>
                    <small className="block muted">
                      {p.regNumber} · {p.districtName}
                    </small>
                  </td>
                  <td>{p.categoryName}</td>
                  <td className="num">{formatMoney(p.cost)}</td>
                  <td className="num">{p.totalVotes}</td>
                  <td className="center">
                    <span className="my-votes">
                      {Array.from({ length: data.maxVotesPerProject }, (_, i) => (
                        <span key={i} className={i < p.myVotes ? 'dot used' : 'dot'} />
                      ))}
                    </span>
                  </td>
                  <td className="nowrap">
                    <button
                      className="btn btn-accent btn-sm"
                      disabled={busy !== null || !data.votingOpen}
                      onClick={() => vote(p.projectId, p.title)}
                    >
                      + Голос
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
