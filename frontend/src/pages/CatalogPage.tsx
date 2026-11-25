import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { query } from '../api/client'
import { formatMoney, projectStatus, votesWord } from '../api/labels'
import { useVotesChanged } from '../api/signalr'
import type { Campaign, PagedResult, ProjectListItem } from '../api/types'
import {
  Alert,
  Empty,
  Field,
  Loading,
  PageHeader,
  Pager,
  StatusBadge,
  useApi,
  useReferences,
} from '../components/ui'

const publicStatuses = ['published', 'winner', 'not_selected', 'implementing', 'completed']

/** Каталог проєктів: пошук, фільтри (кампанія, категорія, район, вартість, статус), сортування, сторінки. */
export function CatalogPage() {
  const refs = useReferences()
  const campaigns = useApi<Campaign[]>('/api/campaigns')
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState(() => Object.fromEntries(params.entries()))

  const campaignId =
    params.get('campaignId') ?? (campaigns.data ? String(campaigns.data[0]?.campaignId ?? '') : '')
  const path = campaigns.data
    ? '/api/projects' +
      query({
        campaignId,
        search: params.get('search'),
        categoryId: params.get('categoryId'),
        districtId: params.get('districtId'),
        minCost: params.get('minCost'),
        maxCost: params.get('maxCost'),
        status: params.get('status'),
        sort: params.get('sort') ?? 'votes',
        page: params.get('page') ?? 1,
        pageSize: 9,
      })
    : null
  const { data, error, loading, reload } = useApi<PagedResult<ProjectListItem>>(path, [path])
  useVotesChanged(() => reload())

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function apply(e?: FormEvent) {
    e?.preventDefault()
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(form)) if (v && k !== 'page') next.set(k, v)
    setParams(next)
  }

  function reset() {
    setForm({})
    setParams(new URLSearchParams())
  }

  function goPage(p: number) {
    const next = new URLSearchParams(params)
    next.set('page', String(p))
    setParams(next)
  }

  return (
    <>
      <PageHeader title="Каталог проєктів" subtitle="Пошук і фільтри за категорією, районом і вартістю" />

      <form className="card filters" onSubmit={apply}>
        <Field label="Пошук">
          <input
            placeholder="Назва, опис або номер GB-…"
            value={form.search ?? ''}
            onChange={(e) => set('search', e.target.value)}
          />
        </Field>
        <Field label="Кампанія">
          <select value={form.campaignId ?? campaignId} onChange={(e) => set('campaignId', e.target.value)}>
            {campaigns.data?.map((c) => (
              <option key={c.campaignId} value={c.campaignId}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Категорія">
          <select value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Усі категорії</option>
            {refs?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Район">
          <select value={form.districtId ?? ''} onChange={(e) => set('districtId', e.target.value)}>
            <option value="">Усі райони</option>
            {refs?.districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Вартість від, грн">
          <input
            type="number"
            min={0}
            step={1000}
            value={form.minCost ?? ''}
            onChange={(e) => set('minCost', e.target.value)}
          />
        </Field>
        <Field label="Вартість до, грн">
          <input
            type="number"
            min={0}
            step={1000}
            value={form.maxCost ?? ''}
            onChange={(e) => set('maxCost', e.target.value)}
          />
        </Field>
        <Field label="Статус">
          <select value={form.status ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">Усі</option>
            {publicStatuses.map((s) => (
              <option key={s} value={s}>
                {projectStatus[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Сортування">
          <select value={form.sort ?? 'votes'} onChange={(e) => set('sort', e.target.value)}>
            <option value="votes">За кількістю голосів</option>
            <option value="cost">Спочатку дешевші</option>
            <option value="cost_desc">Спочатку дорожчі</option>
            <option value="new">Новіші</option>
            <option value="title">За назвою</option>
          </select>
        </Field>
        <div className="filters-actions">
          <button className="btn btn-primary" type="submit">
            Знайти
          </button>
          <button className="btn btn-light" type="button" onClick={reset}>
            Скинути
          </button>
        </div>
      </form>

      <Alert>{error}</Alert>
      {loading && !data ? (
        <Loading />
      ) : data && data.items.length > 0 ? (
        <>
          <p className="muted">Знайдено проєктів: {data.total}</p>
          <div className="cards">
            {data.items.map((p) => (
              <Link to={`/projects/${p.projectId}`} key={p.projectId} className="project-card">
                <div className="project-card-top">
                  <span className="chip">{p.categoryName}</span>
                  <StatusBadge status={p.status} />
                </div>
                <h3>{p.title}</h3>
                <p className="muted">{p.summary}</p>
                <div className="project-card-meta">
                  <span>📍 {p.districtName}</span>
                  <span>{p.regNumber}</span>
                </div>
                <div className="project-card-bottom">
                  <b>{formatMoney(p.cost)}</b>
                  <span className="votes">{votesWord(p.totalVotes)}</span>
                </div>
              </Link>
            ))}
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={goPage} />
        </>
      ) : (
        <Empty>За вашим запитом проєктів не знайдено. Змініть фільтри.</Empty>
      )}
    </>
  )
}
