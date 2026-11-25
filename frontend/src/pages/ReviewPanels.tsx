import { useState } from 'react'
import { api } from '../api/client'
import type { MessageResponse } from './shared'
import type { ProjectDetails } from '../api/types'
import { Alert, Field } from '../components/ui'

/** Панель модератора на картці проєкту: допустити / на доопрацювання / відхилити / на експертизу. */
export function ModerationPanel({
  project,
  onDone,
}: {
  project: ProjectDetails
  onDone: (message: string) => void
}) {
  const [comment, setComment] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const lastApproved = project.status === 'moderation' && project.reviews[0]?.decision === 'approve'

  async function send(decision: string) {
    setBusy(true)
    setMsg(null)
    try {
      const r = await api<MessageResponse>(`/api/moderation/${project.projectId}/decision`, {
        method: 'POST',
        body: { decision, comment },
      })
      setComment('')
      onDone(r.message)
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    try {
      const r = await api<MessageResponse>(`/api/moderation/${project.projectId}/publish`, { method: 'POST' })
      onDone(r.message)
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card panel">
      <h2>Перевірка модератором</h2>
      {lastApproved ? (
        <>
          <p className="muted">
            Проєкт допущено. Опублікуйте його, щоб він з’явився в каталозі та в бюлетені.
          </p>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={publish}>
            Опублікувати
          </button>
        </>
      ) : (
        <>
          <Field label="Коментар" hint="Обов’язковий для повернення на доопрацювання та відхилення">
            <textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="btn-column">
            <button className="btn btn-success" disabled={busy} onClick={() => send('approve')}>
              ✓ Допустити
            </button>
            <button className="btn btn-light" disabled={busy} onClick={() => send('expertise')}>
              Передати на експертизу
            </button>
            <button className="btn btn-warning" disabled={busy} onClick={() => send('revise')}>
              ↩ На доопрацювання
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={() => send('reject')}>
              ✕ Відхилити
            </button>
          </div>
        </>
      )}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
    </div>
  )
}

/** Панель експерта: вид експертизи, рішення, висновок. */
export function ExpertPanel({
  project,
  onDone,
}: {
  project: ProjectDetails
  onDone: (message: string) => void
}) {
  const [type, setType] = useState('technical')
  const [decision, setDecision] = useState('approve')
  const [comment, setComment] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await api<MessageResponse>(`/api/expertise/${project.projectId}/conclusion`, {
        method: 'POST',
        body: { reviewType: type, decision, comment },
      })
      onDone(r.message)
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card panel">
      <h2>Висновок експерта</h2>
      <Field label="Вид експертизи">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="technical">Технічна</option>
          <option value="legal">Юридична</option>
          <option value="financial">Фінансова</option>
        </select>
      </Field>
      <Field label="Рішення">
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="approve">Позитивний висновок (повернути модератору для публікації)</option>
          <option value="revise">Потребує доопрацювання автором</option>
          <option value="reject">Негативний висновок (відхилити)</option>
        </select>
      </Field>
      <Field label="Висновок">
        <textarea rows={5} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
        Зберегти висновок
      </button>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
    </div>
  )
}
