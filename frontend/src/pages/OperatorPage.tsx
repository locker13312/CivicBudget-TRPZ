import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { formatDate, formatMoney, methodNames, verificationNames } from '../api/labels'
import type { MyBallot, PagedResult, ProjectListItem, UserRow } from '../api/types'
import { Alert, Field, PageHeader, useApi, useReferences } from '../components/ui'
import type { MessageResponse } from './shared'

/** Оператор пункту голосування: внесення паперового бюлетеня (виборець, пункт, проєкти). */
export function OperatorPage() {
  const refs = useReferences()
  const campaign = useApi<MyBallot['campaign']>('/api/campaigns/current')
  const projects = useApi<PagedResult<ProjectListItem>>(
    campaign.data
      ? `/api/projects?campaignId=${campaign.data.campaignId}&status=published&sort=title&pageSize=100`
      : null,
    [campaign.data?.campaignId],
  )

  const [search, setSearch] = useState('')
  const [voters, setVoters] = useState<UserRow[] | null>(null)
  const [voter, setVoter] = useState<UserRow | null>(null)
  const [stationId, setStationId] = useState(0)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const max = campaign.data?.maxVotesPerProject ?? 2

  async function find(e: FormEvent) {
    e.preventDefault()
    setVoters(await api<UserRow[]>(`/api/operator/voters?q=${encodeURIComponent(search)}`))
  }

  async function submit() {
    if (!voter) return setMsg({ kind: 'error', text: 'Оберіть виборця.' })
    if (!stationId) return setMsg({ kind: 'error', text: 'Оберіть пункт голосування.' })
    setBusy(true)
    setMsg(null)
    try {
      const items = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([projectId, count]) => ({ projectId: Number(projectId), count }))
      const r = await api<MessageResponse>('/api/operator/ballots', {
        method: 'POST',
        body: { voterId: voter.userId, stationId, items },
      })
      setMsg({ kind: 'success', text: `${r.message} Виборець: ${voter.fullName}.` })
      setCounts({})
      setVoter(null)
      setVoters(null)
      setSearch('')
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Внесення паперового бюлетеня" subtitle={campaign.data?.name} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="grid-2">
        <section className="card">
          <h2>1. Виборець</h2>
          <form className="inline-form" onSubmit={find}>
            <input
              placeholder="Прізвище, ім’я, e-mail або номер"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary">Знайти</button>
          </form>
          {voters && voters.length === 0 && <p className="muted">Нікого не знайдено.</p>}
          {voters && voters.length > 0 && (
            <ul className="pick-list">
              {voters.map((u) => (
                <li key={u.userId}>
                  <button className={voter?.userId === u.userId ? 'picked' : ''} onClick={() => setVoter(u)}>
                    <b>{u.fullName}</b>
                    <small>
                      №{u.userId} · нар. {formatDate(u.birthDate)} · {verificationNames[u.verificationStatus]}
                      {u.verificationMethod ? ` (${methodNames[u.verificationMethod]})` : ''}
                      {u.isBlocked ? ' · заблоковано' : ''}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {voter && (
            <p className="selected">
              Обрано: <b>{voter.fullName}</b>
            </p>
          )}
        </section>

        <section className="card">
          <h2>2. Пункт голосування</h2>
          <Field label="Пункт">
            <select value={stationId} onChange={(e) => setStationId(Number(e.target.value))}>
              <option value={0}>— оберіть пункт —</option>
              {refs?.stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="muted small">
            Віддано в бюлетені: <b>{total}</b> з {campaign.data?.votesPerVoter ?? 5} голосів (до {max} за
            проєкт). Правила перевіряє база даних під час збереження.
          </p>
        </section>
      </div>

      <section className="card">
        <h2>3. Позначки в бюлетені</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Проєкт</th>
              <th>Категорія</th>
              <th className="num">Вартість</th>
              <th className="center">Голосів</th>
            </tr>
          </thead>
          <tbody>
            {projects.data?.items.map((p) => (
              <tr key={p.projectId} className={counts[p.projectId] ? 'row-mine' : ''}>
                <td>
                  {p.title}
                  <small className="block muted">{p.regNumber}</small>
                </td>
                <td>{p.categoryName}</td>
                <td className="num">{formatMoney(p.cost)}</td>
                <td className="center">
                  <select
                    value={counts[p.projectId] ?? 0}
                    onChange={(e) => setCounts((c) => ({ ...c, [p.projectId]: Number(e.target.value) }))}
                  >
                    {Array.from({ length: max + 2 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy || total === 0} onClick={submit}>
            Внести бюлетень
          </button>
        </div>
      </section>
    </>
  )
}
