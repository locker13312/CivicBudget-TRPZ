import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, query } from '../api/client'
import {
  auditActions,
  campaignStatus,
  campaignStatusOrder,
  formatDate,
  formatDateTime,
  formatMoney,
  methodNames,
  projectStatus,
  roleNames,
  verificationNames,
} from '../api/labels'
import type { AuditRow, Campaign, PagedResult, Statistics, UserRow, WinnerRow } from '../api/types'
import {
  Alert,
  CampaignBadge,
  Empty,
  Field,
  Loading,
  PageHeader,
  Pager,
  useApi,
  useReferences,
} from '../components/ui'
import type { MessageResponse } from './shared'

type Msg = { kind: 'error' | 'success'; text: string } | null

// ======================================================================
// Кампанія: параметри, ліміти категорій, етапи, визначення переможців
// ======================================================================

type CampaignForm = Omit<Campaign, 'campaignId' | 'status' | 'categories'> & {
  categories: { categoryId: number; enabled: boolean; budgetLimit: number }[]
}

export function AdminCampaignPage() {
  const refs = useReferences()
  const campaigns = useApi<Campaign[]>('/api/campaigns')
  const [selected, setSelected] = useState<number>(0)
  const campaign = campaigns.data?.find((c) => c.campaignId === selected) ?? campaigns.data?.[0]
  const [form, setForm] = useState<CampaignForm | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [winners, setWinners] = useState<WinnerRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!campaign || !refs) return
    const { categories, ...rest } = campaign
    setForm({
      ...rest,
      categories: refs.categories.map((c) => {
        const cc = categories.find((x) => x.categoryId === c.id)
        return { categoryId: c.id, enabled: !!cc, budgetLimit: cc?.budgetLimit ?? 0 }
      }),
    })
  }, [campaign, refs])

  if (campaigns.loading || !form || !campaign) return <Loading />

  const set = <K extends keyof CampaignForm>(k: K, v: CampaignForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))
  const num = (k: keyof CampaignForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, Number(e.target.value) as never)
  const date = (k: keyof CampaignForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, e.target.value as never)

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ kind: 'success', text: await action() })
      await campaigns.reload()
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const body = {
        ...form,
        categories: form.categories
          .filter((c) => c.enabled)
          .map((c) => ({ categoryId: c.categoryId, budgetLimit: c.budgetLimit })),
      }
      return (
        await api<MessageResponse>(`/api/admin/campaigns/${campaign.campaignId}`, { method: 'PUT', body })
      ).message
    })
  }

  const setStatus = (status: string) =>
    run(async () => {
      setWinners(null)
      return (
        await api<MessageResponse>(`/api/admin/campaigns/${campaign.campaignId}/status`, {
          method: 'POST',
          body: { status },
        })
      ).message
    })

  // «Визначити переможців» → usp_SelectWinners (ADO.NET) → таблиця рейтингу
  const selectWinners = () =>
    run(async () => {
      const rows = await api<WinnerRow[]>(`/api/admin/campaigns/${campaign.campaignId}/select-winners`, {
        method: 'POST',
      })
      setWinners(rows)
      return `Переможців визначено: ${rows.filter((r) => r.isWinner).length} з ${rows.length} проєктів. Кампанія перейшла на етап «Реалізація».`
    })

  const idx = campaignStatusOrder.indexOf(campaign.status)

  return (
    <>
      <PageHeader
        title="Керування кампанією"
        subtitle={
          <>
            {campaign.name} · <CampaignBadge status={campaign.status} />
          </>
        }
        actions={
          <Field label="Кампанія">
            <select value={campaign.campaignId} onChange={(e) => setSelected(Number(e.target.value))}>
              {campaigns.data?.map((c) => (
                <option key={c.campaignId} value={c.campaignId}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        }
      />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <section className="card">
        <h2>Етап кампанії</h2>
        <div className="stage-switch">
          {campaignStatusOrder.map((s, i) => (
            <button
              key={s}
              className={`stage-btn ${s === campaign.status ? 'current' : i < idx ? 'past' : ''}`}
              disabled={busy || s === campaign.status}
              onClick={() => setStatus(s)}
            >
              <span>{i + 1}</span>
              {campaignStatus[s]}
            </button>
          ))}
        </div>
        <div className="winners-bar">
          <p className="muted small">
            Переможців визначає процедура <code>usp_SelectWinners</code>: у кожній категорії за кількістю
            голосів, поки проєкт вміщується в залишок ліміту. Доступно лише на етапі «Підрахунок голосів».
          </p>
          <button className="btn btn-accent" disabled={busy} onClick={selectWinners}>
            🏆 Визначити переможців
          </button>
        </div>
      </section>

      {winners && (
        <section className="card">
          <h2>Рейтинг і переможці</h2>
          {winners.length === 0 ? (
            <Empty>Немає опублікованих проєктів для відбору.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Категорія (ліміт)</th>
                  <th>Місце</th>
                  <th>Проєкт</th>
                  <th className="num">Голоси</th>
                  <th className="num">Вартість</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w) => (
                  <tr key={w.projectId} className={w.isWinner ? 'row-win' : ''}>
                    <td>
                      {w.categoryName}
                      <small className="block muted">{formatMoney(w.categoryLimit)}</small>
                    </td>
                    <td>{w.place}</td>
                    <td>
                      <Link to={`/projects/${w.projectId}`}>{w.title}</Link>
                      <small className="block muted">{w.regNumber}</small>
                    </td>
                    <td className="num">{w.votes}</td>
                    <td className="num">{formatMoney(w.cost)}</td>
                    <td>
                      {w.isWinner ? (
                        <span className="badge st-winner">🏆 Переможець</span>
                      ) : (
                        <span className="badge st-not_selected">Не вмістився в ліміт / мало голосів</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <form className="card form" onSubmit={save}>
        <fieldset disabled={busy}>
          <h2>Параметри кампанії</h2>
          <div className="grid-3">
            <Field label="Назва">
              <input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Рік">
              <input type="number" value={form.campaignYear} onChange={num('campaignYear')} />
            </Field>
            <Field label="Загальний бюджет, грн">
              <input type="number" value={form.totalBudget} onChange={num('totalBudget')} />
            </Field>
            <Field label="Мін. вартість проєкту, грн">
              <input type="number" value={form.minProjectCost} onChange={num('minProjectCost')} />
            </Field>
            <Field label="Макс. вартість проєкту, грн">
              <input type="number" value={form.maxProjectCost} onChange={num('maxProjectCost')} />
            </Field>
            <Field label="Проєктів на автора">
              <input type="number" value={form.maxProjectsPerAuthor} onChange={num('maxProjectsPerAuthor')} />
            </Field>
            <Field label="Голосів у виборця">
              <input type="number" value={form.votesPerVoter} onChange={num('votesPerVoter')} />
            </Field>
            <Field label="Голосів за один проєкт">
              <input type="number" value={form.maxVotesPerProject} onChange={num('maxVotesPerProject')} />
            </Field>
            <Field label="Мінімальний вік виборця">
              <input type="number" value={form.minVoterAge} onChange={num('minVoterAge')} />
            </Field>
          </div>

          <h2>Дати етапів</h2>
          <div className="grid-3">
            <Field label="Початок подання">
              <input type="date" value={form.submissionStart} onChange={date('submissionStart')} />
            </Field>
            <Field label="Кінець подання">
              <input type="date" value={form.submissionEnd} onChange={date('submissionEnd')} />
            </Field>
            <Field label="Кінець розгляду">
              <input type="date" value={form.reviewEnd} onChange={date('reviewEnd')} />
            </Field>
            <Field label="Початок голосування">
              <input type="date" value={form.votingStart} onChange={date('votingStart')} />
            </Field>
            <Field label="Кінець голосування">
              <input type="date" value={form.votingEnd} onChange={date('votingEnd')} />
            </Field>
            <Field label="Оголошення результатів">
              <input type="date" value={form.resultsDate} onChange={date('resultsDate')} />
            </Field>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.showInterimResults}
              onChange={(e) => set('showInterimResults', e.target.checked)}
            />
            Показувати проміжні результати під час голосування
          </label>

          <h2>Ліміти категорій</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Відкрита</th>
                <th>Категорія</th>
                <th style={{ width: 220 }}>Ліміт, грн</th>
              </tr>
            </thead>
            <tbody>
              {form.categories.map((c, i) => (
                <tr key={c.categoryId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) =>
                        set(
                          'categories',
                          form.categories.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)),
                        )
                      }
                    />
                  </td>
                  <td>{refs?.categories.find((r) => r.id === c.categoryId)?.name}</td>
                  <td>
                    <input
                      type="number"
                      disabled={!c.enabled}
                      value={c.budgetLimit}
                      onChange={(e) =>
                        set(
                          'categories',
                          form.categories.map((x, j) =>
                            j === i ? { ...x, budgetLimit: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Сума лімітів</td>
                <td>
                  <b>
                    {formatMoney(
                      form.categories.filter((c) => c.enabled).reduce((s, c) => s + c.budgetLimit, 0),
                    )}
                  </b>
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="form-actions">
            <button className="btn btn-primary">Зберегти параметри</button>
          </div>
        </fieldset>
      </form>
    </>
  )
}

// ======================================================================
// Користувачі й ролі
// ======================================================================

export function AdminUsersPage() {
  const refs = useReferences()
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const path = '/api/admin/users' + query({ search: applied, page, pageSize: 12 })
  const { data, error, loading, reload } = useApi<PagedResult<UserRow>>(path, [path])
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [msg, setMsg] = useState<Msg>(null)

  async function saveRoles() {
    if (!editing) return
    try {
      const r = await api<MessageResponse>(`/api/admin/users/${editing.userId}/roles`, {
        method: 'PUT',
        body: { roles },
      })
      setMsg({ kind: 'success', text: `${editing.fullName}: ${r.message}` })
      setEditing(null)
      reload()
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    }
  }

  async function toggleBlock(u: UserRow) {
    try {
      const r = await api<MessageResponse>(`/api/admin/users/${u.userId}/block`, {
        method: 'PUT',
        body: { isBlocked: !u.isBlocked },
      })
      setMsg({ kind: 'success', text: `${u.fullName}: ${r.message}` })
      reload()
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    }
  }

  return (
    <>
      <PageHeader title="Користувачі та ролі" subtitle={data && `Усього: ${data.total}`} />
      <form
        className="card inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setApplied(search)
        }}
      >
        <input
          placeholder="Пошук за прізвищем, ім’ям або e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary">Знайти</button>
      </form>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Alert>{error}</Alert>
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>№</th>
                <th>ПІБ</th>
                <th>E-mail</th>
                <th>Дата народження</th>
                <th>Верифікація</th>
                <th>Ролі</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.userId} className={u.isBlocked ? 'row-blocked' : ''}>
                  <td>{u.userId}</td>
                  <td>
                    {u.fullName}
                    {u.isBlocked && <small className="block warn-text">заблоковано</small>}
                  </td>
                  <td>{u.email ?? <span className="muted">лише BankID</span>}</td>
                  <td>{formatDate(u.birthDate)}</td>
                  <td>
                    {verificationNames[u.verificationStatus]}
                    {u.verificationMethod && (
                      <small className="block muted">{methodNames[u.verificationMethod]}</small>
                    )}
                  </td>
                  <td>
                    {u.roles.map((r) => (
                      <span key={r} className="chip">
                        {roleNames[r] ?? r}
                      </span>
                    ))}
                  </td>
                  <td className="nowrap">
                    <button
                      className="btn btn-light btn-sm"
                      onClick={() => {
                        setEditing(u)
                        setRoles(u.roles)
                      }}
                    >
                      Ролі
                    </button>{' '}
                    <button
                      className={`btn btn-sm ${u.isBlocked ? 'btn-success' : 'btn-danger'}`}
                      onClick={() => toggleBlock(u)}
                    >
                      {u.isBlocked ? 'Розблокувати' : 'Заблокувати'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Ролі користувача"
          >
            <h2>Ролі: {editing.fullName}</h2>
            {refs?.roles.map((r) => (
              <label key={r.code} className="checkbox">
                <input
                  type="checkbox"
                  checked={roles.includes(r.code)}
                  onChange={(e) =>
                    setRoles((rs) => (e.target.checked ? [...rs, r.code] : rs.filter((x) => x !== r.code)))
                  }
                />
                {r.name}
              </label>
            ))}
            <div className="form-actions">
              <button className="btn btn-light" onClick={() => setEditing(null)}>
                Скасувати
              </button>
              <button className="btn btn-primary" onClick={saveRoles}>
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ======================================================================
// Журнал аудиту (ADO.NET: SqlDataAdapter + DataTable, OFFSET … FETCH NEXT)
// ======================================================================

export function AdminAuditPage() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const path = '/api/admin/audit' + query({ page, pageSize: 20, entity })
  const { data, error, loading } = useApi<PagedResult<AuditRow>>(path, [path])

  return (
    <>
      <PageHeader
        title="Журнал аудиту"
        subtitle="Зміни статусів проєктів записує тригер TR_Project_StatusChange; входи й дії адміністратора — застосунок"
        actions={
          <Field label="Об’єкт">
            <select
              value={entity}
              onChange={(e) => {
                setPage(1)
                setEntity(e.target.value)
              }}
            >
              <option value="">Усі</option>
              <option value="Project">Проєкти</option>
              <option value="Campaign">Кампанії</option>
              <option value="UserAccount">Користувачі</option>
            </select>
          </Field>
        }
      />
      <Alert>{error}</Alert>
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Час</th>
                <th>Користувач</th>
                <th>Дія</th>
                <th>Об’єкт</th>
                <th>Деталі</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((a) => (
                <tr key={a.auditId}>
                  <td className="nowrap">{formatDateTime(a.createdAt)}</td>
                  <td>{a.userName ?? <span className="muted">система</span>}</td>
                  <td>{auditActions[a.actionCode] ?? a.actionCode}</td>
                  <td className="nowrap">
                    {a.entityName === 'Project' && a.entityId ? (
                      <Link to={`/projects/${a.entityId}`}>Проєкт #{a.entityId}</Link>
                    ) : (
                      `${a.entityName} #${a.entityId ?? ''}`
                    )}
                  </td>
                  <td>{translateDetails(a.details)}</td>
                  <td className="muted">{a.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && (
            <>
              <p className="muted small">Записів: {data.total}</p>
              <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </div>
      )}
    </>
  )
}

/** «було published, стало winner» → українські назви статусів. */
function translateDetails(details: string | null) {
  if (!details) return '—'
  return details.replace(/\b([a-z_]+)\b/g, (m) => projectStatus[m] ?? campaignStatus[m] ?? m)
}

// ======================================================================
// Зведена статистика (LINQ: join … group … by … into)
// ======================================================================

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="stat-bar" title={label}>
      <span style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

export function AdminStatisticsPage() {
  const campaigns = useApi<Campaign[]>('/api/campaigns')
  const [id, setId] = useState('')
  const cid = id || String(campaigns.data?.[0]?.campaignId ?? '')
  const { data, error, loading } = useApi<Statistics>(
    cid ? `/api/admin/statistics?campaignId=${cid}` : null,
    [cid],
  )

  const maxCat = Math.max(0, ...(data?.byCategory.map((c) => c.totalVotes) ?? []))
  const maxDist = Math.max(0, ...(data?.byDistrict.map((c) => c.totalVotes) ?? []))

  return (
    <>
      <PageHeader
        title="Зведена статистика"
        subtitle={data?.campaign.name}
        actions={
          <Field label="Кампанія">
            <select value={cid} onChange={(e) => setId(e.target.value)}>
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
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="tiles">
              <div className="tile">
                <b>{data.summary.projects}</b>
                <span>проєктів у кампанії</span>
                <small>опубліковано: {data.summary.publishedProjects}</small>
              </div>
              <div className="tile">
                <b>{data.summary.votes}</b>
                <span>голосів</span>
                <small>
                  онлайн {data.summary.onlineVotes} · паперові {data.summary.paperVotes}
                </small>
              </div>
              <div className="tile">
                <b>{data.summary.voters}</b>
                <span>виборців проголосувало</span>
              </div>
              <div className="tile">
                <b>{data.summary.users}</b>
                <span>користувачів</span>
                <small>верифіковано: {data.summary.verifiedUsers}</small>
              </div>
            </div>

            <section className="card">
              <h2>За категоріями</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Категорія</th>
                    <th className="num">Проєктів</th>
                    <th className="num">Сумарна вартість</th>
                    <th className="num">Ліміт</th>
                    <th style={{ width: '32%' }}>Голоси</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCategory.map((c) => (
                    <tr key={c.categoryName}>
                      <td>{c.categoryName}</td>
                      <td className="num">{c.projectCount}</td>
                      <td className={`num ${c.totalCost > c.budgetLimit ? 'warn-text' : ''}`}>
                        {formatMoney(c.totalCost)}
                      </td>
                      <td className="num">{formatMoney(c.budgetLimit)}</td>
                      <td>
                        <div className="bar-cell">
                          <Bar
                            value={c.totalVotes}
                            max={maxCat}
                            label={`${c.categoryName}: ${c.totalVotes} голосів`}
                          />
                          <b>{c.totalVotes}</b>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">
                Червоним — категорії, де заявлено більше, ніж дозволяє ліміт (конкуренція за кошти).
              </p>
            </section>

            <div className="grid-2">
              <section className="card">
                <h2>За районами</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Район</th>
                      <th className="num">Проєктів</th>
                      <th style={{ width: '45%' }}>Голоси</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDistrict.map((d) => (
                      <tr key={d.districtName}>
                        <td>{d.districtName}</td>
                        <td className="num">{d.projectCount}</td>
                        <td>
                          <div className="bar-cell">
                            <Bar
                              value={d.totalVotes}
                              max={maxDist}
                              label={`${d.districtName}: ${d.totalVotes} голосів`}
                            />
                            <b>{d.totalVotes}</b>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="card">
                <h2>Проєкти за статусами</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Статус</th>
                      <th className="num">Кількість</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byStatus.map((s) => (
                      <tr key={s.status}>
                        <td>{projectStatus[s.status] ?? s.status}</td>
                        <td className="num">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )
      )}
    </>
  )
}
