import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { formatMoney } from '../api/labels'
import type { BudgetItemInput, Campaign, ProjectEdit, ProjectForEdit, SubmitResult } from '../api/types'
import { Alert, Field, Loading, PageHeader, StatusBadge, useApi, useReferences } from '../components/ui'

const emptyItem = (): BudgetItemInput => ({ name: '', unit: 'шт', quantity: 1, unitPrice: 0 })

const emptyForm = (): ProjectEdit => ({
  title: '',
  summary: '',
  description: '',
  address: '',
  categoryId: 0,
  districtId: 0,
  budgetItems: [emptyItem()],
})

/**
 * Форма проєкту: основні дані, кошторис (додати/видалити позиції, сума рахується),
 * «Зберегти чернетку» та «Подати» (на сервері — usp_SubmitProject).
 */
export function ProjectFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const refs = useReferences()
  const campaign = useApi<Campaign>('/api/campaigns/current')
  const existing = useApi<ProjectForEdit>(isNew ? null : `/api/my/projects/${id}`, [id])

  const [form, setForm] = useState<ProjectEdit>(emptyForm)
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const p = existing.data?.project
    if (!p) return
    setForm({
      title: p.title,
      summary: p.summary ?? '',
      description: p.description ?? '',
      address: p.address ?? '',
      categoryId: p.categoryId,
      districtId: p.districtId,
      budgetItems: p.budgetItems.length
        ? p.budgetItems.map((b) => ({
            name: b.name,
            unit: b.unit,
            quantity: b.quantity,
            unitPrice: b.unitPrice,
          }))
        : [emptyItem()],
    })
  }, [existing.data])

  if (!isNew && existing.loading) return <Loading />
  if (!isNew && existing.error) return <Alert>{existing.error}</Alert>

  const canEdit = isNew || existing.data?.canEdit
  const total = form.budgetItems.reduce(
    (s, b) => s + (Number(b.quantity) || 0) * (Number(b.unitPrice) || 0),
    0,
  )
  const c = campaign.data
  const outOfRange = c && (total < c.minProjectCost || total > c.maxProjectCost)
  const status = existing.data?.project.status ?? 'draft'

  const set = <K extends keyof ProjectEdit>(k: K, v: ProjectEdit[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setItem = (i: number, patch: Partial<BudgetItemInput>) =>
    set(
      'budgetItems',
      form.budgetItems.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    )

  /** Зберігає чернетку; повертає її id. */
  async function save(): Promise<number> {
    const body = {
      ...form,
      budgetItems: form.budgetItems
        .filter((b) => b.name.trim())
        .map((b) => ({ ...b, quantity: Number(b.quantity), unitPrice: Number(b.unitPrice) })),
    }
    if (isNew) {
      const r = await api<{ projectId: number }>('/api/my/projects', { method: 'POST', body })
      return r.projectId
    }
    await api(`/api/my/projects/${id}`, { method: 'PUT', body })
    return Number(id)
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const projectId = await save()
      setMsg({ kind: 'success', text: 'Чернетку збережено.' })
      if (isNew) navigate(`/my/projects/${projectId}`, { replace: true })
      else existing.reload()
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit() {
    setBusy(true)
    setMsg(null)
    let projectId: number | null = null
    try {
      projectId = await save()
      // подання: usp_SubmitProject перевіряє етап кампанії, опис, адресу, вартість і ліміт проєктів автора
      const r = await api<SubmitResult>(`/api/my/projects/${projectId}/submit`, { method: 'POST' })
      navigate('/my/projects', {
        replace: true,
        state: {
          flash: `Проєкт подано! Реєстраційний номер ${r.regNumber}, вартість ${formatMoney(r.estimatedCost)}.`,
        },
      })
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message })
      // чернетку вже збережено — переходимо на її адресу, щоб не створити дублікат
      if (isNew && projectId) navigate(`/my/projects/${projectId}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="breadcrumbs">
        <Link to="/my/projects">Мої проєкти</Link> / {isNew ? 'Новий проєкт' : form.title}
      </p>
      <PageHeader
        title={
          isNew ? 'Новий проєкт' : status === 'revision' ? 'Доопрацювання проєкту' : 'Редагування проєкту'
        }
        subtitle={
          c && `${c.name}: вартість від ${formatMoney(c.minProjectCost)} до ${formatMoney(c.maxProjectCost)}`
        }
        actions={!isNew && <StatusBadge status={status} />}
      />

      {existing.data?.revisionComment && (
        <Alert kind="info">
          <b>Проєкт повернуто на доопрацювання.</b> Коментар модератора: {existing.data.revisionComment}
        </Alert>
      )}
      {!canEdit && <Alert kind="info">Проєкт уже подано — редагування недоступне.</Alert>}

      <form className="card form" onSubmit={onSave}>
        <fieldset disabled={!canEdit || busy}>
          <h2>Основні дані</h2>
          <Field label="Назва проєкту *">
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={200}
              required
            />
          </Field>
          <Field label="Короткий опис" hint="Одне-два речення для каталогу">
            <input value={form.summary} onChange={(e) => set('summary', e.target.value)} maxLength={500} />
          </Field>
          <Field label="Повний опис *" hint="Що буде зроблено, для кого і чому це важливо">
            <textarea
              rows={6}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <div className="grid-3">
            <Field label="Категорія *">
              <select value={form.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
                <option value={0}>— оберіть —</option>
                {(c?.categories ?? []).map((cat) => (
                  <option key={cat.categoryId} value={cat.categoryId}>
                    {cat.categoryName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Район *">
              <select value={form.districtId} onChange={(e) => set('districtId', Number(e.target.value))}>
                <option value={0}>— оберіть —</option>
                {refs?.districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Адреса (місце реалізації) *">
              <input value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={200} />
            </Field>
          </div>

          <h2>Кошторис</h2>
          <table className="table budget-editor">
            <thead>
              <tr>
                <th>№</th>
                <th>Найменування</th>
                <th style={{ width: 90 }}>Од. виміру</th>
                <th style={{ width: 110 }}>Кількість</th>
                <th style={{ width: 140 }}>Ціна, грн</th>
                <th className="num" style={{ width: 150 }}>
                  Сума
                </th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {form.budgetItems.map((b, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      value={b.name}
                      placeholder="Напр., лавка з урною"
                      onChange={(e) => setItem(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input value={b.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      value={b.quantity}
                      onChange={(e) => setItem(i, { quantity: e.target.value as unknown as number })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={b.unitPrice}
                      onChange={(e) => setItem(i, { unitPrice: e.target.value as unknown as number })}
                    />
                  </td>
                  <td className="num">
                    {formatMoney((Number(b.quantity) || 0) * (Number(b.unitPrice) || 0))}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Видалити позицію"
                      onClick={() =>
                        set(
                          'budgetItems',
                          form.budgetItems.filter((_, j) => j !== i),
                        )
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <button
                    type="button"
                    className="btn btn-light btn-sm"
                    onClick={() => set('budgetItems', [...form.budgetItems, emptyItem()])}
                  >
                    + Додати позицію
                  </button>
                </td>
                <td colSpan={3} className="num">
                  Разом (вартість проєкту):
                </td>
                <td className={`num ${outOfRange ? 'warn-text' : ''}`}>
                  <b>{formatMoney(total)}</b>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          {outOfRange && c && (
            <p className="warn-text small">
              Вартість має бути від {formatMoney(c.minProjectCost)} до {formatMoney(c.maxProjectCost)} —
              інакше проєкт не вдасться подати.
            </p>
          )}

          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

          <div className="form-actions">
            <button className="btn btn-light" type="submit">
              💾 Зберегти чернетку
            </button>
            <button className="btn btn-primary" type="button" onClick={onSubmit}>
              {status === 'revision' ? 'Подати повторно' : 'Подати проєкт'}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  )
}
