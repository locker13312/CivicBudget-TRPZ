import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { decisionNames, formatDate, formatMoney } from '../api/labels'
import type { ModerationQueue, ProjectListItem } from '../api/types'
import { Alert, Empty, Loading, PageHeader, StatusBadge, useApi } from '../components/ui'
import type { MessageResponse } from './shared'

function ProjectsTable({
  items,
  action,
}: {
  items: ProjectListItem[]
  action: (p: ProjectListItem) => React.ReactNode
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Номер</th>
          <th>Назва</th>
          <th>Категорія / район</th>
          <th className="num">Вартість</th>
          <th>Автор</th>
          <th>Статус</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.projectId}>
            <td className="nowrap">{p.regNumber}</td>
            <td>
              <b>{p.title}</b>
              {p.lastDecision && (
                <small className="block muted">
                  Останнє рішення: {decisionNames[p.lastDecision]}
                  {p.lastComment ? ` — ${p.lastComment}` : ''}
                </small>
              )}
            </td>
            <td>
              {p.categoryName}
              <small className="block muted">{p.districtName}</small>
            </td>
            <td className="num">{formatMoney(p.cost)}</td>
            <td>{p.authorName}</td>
            <td>
              <StatusBadge status={p.status} />
            </td>
            <td className="nowrap">{action(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Модератор: черга проєктів на перевірку та допущені проєкти, готові до публікації. */
export function ModerationPage() {
  const { data, error, loading, reload } = useApi<ModerationQueue>('/api/moderation/queue')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  async function publish(id: number) {
    try {
      const r = await api<MessageResponse>(`/api/moderation/${id}/publish`, { method: 'POST' })
      setMsg({ kind: 'success', text: r.message })
      reload()
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    }
  }

  return (
    <>
      <PageHeader title="Модерація проєктів" subtitle="Перевірка поданих проєктів і публікація допущених" />
      <Alert>{error}</Alert>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <section className="card">
            <h2>Черга на перевірку ({data?.queue.length ?? 0})</h2>
            {data?.queue.length ? (
              <ProjectsTable
                items={data.queue}
                action={(p) => (
                  <Link className="btn btn-primary btn-sm" to={`/projects/${p.projectId}`}>
                    Перевірити
                  </Link>
                )}
              />
            ) : (
              <Empty>Нових проєктів немає.</Empty>
            )}
          </section>
          <section className="card">
            <h2>Допущені, готові до публікації ({data?.readyToPublish.length ?? 0})</h2>
            {data?.readyToPublish.length ? (
              <ProjectsTable
                items={data.readyToPublish}
                action={(p) => (
                  <>
                    <Link className="btn btn-light btn-sm" to={`/projects/${p.projectId}`}>
                      Переглянути
                    </Link>{' '}
                    <button className="btn btn-success btn-sm" onClick={() => publish(p.projectId)}>
                      Опублікувати
                    </button>
                  </>
                )}
              />
            ) : (
              <Empty>Немає допущених проєктів, що чекають публікації.</Empty>
            )}
          </section>
        </>
      )}
    </>
  )
}

/** Експерт: проєкти на експертизі. */
export function ExpertisePage() {
  const { data, error, loading } = useApi<ProjectListItem[]>('/api/expertise')
  return (
    <>
      <PageHeader title="Експертиза проєктів" subtitle="Технічна, юридична та фінансова оцінка" />
      <Alert>{error}</Alert>
      {loading ? (
        <Loading />
      ) : data?.length ? (
        <div className="card">
          <ProjectsTable
            items={data}
            action={(p) => (
              <Link className="btn btn-primary btn-sm" to={`/projects/${p.projectId}`}>
                Надати висновок
              </Link>
            )}
          />
        </div>
      ) : (
        <Empty>Проєктів на експертизі немає.</Empty>
      )}
    </>
  )
}

/** Сповіщення (створює тригер TR_Project_StatusChange при зміні статусу проєкту). */
export function NotificationsPage() {
  const { data, error, loading, reload } =
    useApi<import('../api/types').NotificationItem[]>('/api/notifications')

  async function readAll() {
    await api('/api/notifications/read-all', { method: 'POST' })
    reload()
  }
  async function read(id: number) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' })
    reload()
  }

  return (
    <>
      <PageHeader
        title="Сповіщення"
        actions={
          <button className="btn btn-light" onClick={readAll}>
            Позначити всі прочитаними
          </button>
        }
      />
      <Alert>{error}</Alert>
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <ul className="notifications">
          {data.map((n) => (
            <li key={n.notificationId} className={n.isRead ? 'read' : 'unread'}>
              <div>
                <p>{n.body}</p>
                <small className="muted">
                  {formatDate(n.createdAt)}
                  {n.projectId && (
                    <>
                      {' '}
                      · <Link to={`/projects/${n.projectId}`}>до проєкту</Link>
                    </>
                  )}
                </small>
              </div>
              {!n.isRead && (
                <button className="btn btn-light btn-sm" onClick={() => read(n.notificationId)}>
                  Прочитано
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Сповіщень немає.</Empty>
      )}
    </>
  )
}
