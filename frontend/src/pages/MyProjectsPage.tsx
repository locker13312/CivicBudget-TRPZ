import { Link, useLocation } from 'react-router-dom'
import { formatDateTime, formatMoney } from '../api/labels'
import type { ProjectListItem } from '../api/types'
import { Alert, Empty, Loading, PageHeader, StatusBadge, useApi } from '../components/ui'

/** Автор: перелік власних проєктів з усіх кампаній. */
export function MyProjectsPage() {
  const { data, error, loading } = useApi<ProjectListItem[]>('/api/my/projects')
  const flash = (useLocation().state as { flash?: string } | null)?.flash

  return (
    <>
      <PageHeader
        title="Мої проєкти"
        subtitle="Чернетки, подані проєкти та проєкти на доопрацюванні"
        actions={
          <Link to="/my/projects/new" className="btn btn-primary">
            + Новий проєкт
          </Link>
        }
      />
      {flash && <Alert kind="success">{flash}</Alert>}
      <Alert>{error}</Alert>
      {loading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty>У вас ще немає проєктів. Створіть перший!</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Назва</th>
                <th>Категорія</th>
                <th className="num">Вартість</th>
                <th>Статус</th>
                <th>Оновлено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
                const editable = p.status === 'draft' || p.status === 'revision'
                return (
                  <tr key={p.projectId} className={p.status === 'revision' ? 'row-attention' : ''}>
                    <td>{p.regNumber ?? '—'}</td>
                    <td>
                      <b>{p.title}</b>
                      {p.status === 'revision' && p.lastComment && (
                        <small className="block warn-text">Коментар модератора: {p.lastComment}</small>
                      )}
                    </td>
                    <td>{p.categoryName}</td>
                    <td className="num">{formatMoney(p.cost)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>{formatDateTime(p.updatedAt)}</td>
                    <td className="nowrap">
                      {editable ? (
                        <Link className="btn btn-primary btn-sm" to={`/my/projects/${p.projectId}`}>
                          {p.status === 'revision' ? 'Доопрацювати' : 'Редагувати'}
                        </Link>
                      ) : (
                        <Link className="btn btn-light btn-sm" to={`/projects/${p.projectId}`}>
                          Переглянути
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
