import { EditOutlined, EyeOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Dropdown, Empty, Table, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { formatDateTime, formatMoney } from '../api/labels'
import type { ProjectListItem } from '../api/types'
import { LoadState, PageTitle, StatusTag, useLoad } from '../components/common'

const EDITABLE = ['draft', 'revision']

/** «Мої проєкти»: усі проєкти автора, коментар модератора для повернених на доопрацювання. */
export function MyProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const flash = (location.state as { flash?: string } | null)?.flash
  const { data, loading, error } = useLoad(() => api<ProjectListItem[]>('/api/my/projects'), [])

  return (
    <>
      <PageTitle
        title={t('Мої проєкти')}
        subtitle={t('Чернетки, подані проєкти та їхні статуси')}
        help="myProjects"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/my/projects/new')}>
            {t('Новий проєкт')}
          </Button>
        }
      />
      {flash && <Alert type="success" showIcon message={flash} style={{ marginBottom: 16 }} closable />}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('Що можна змінювати')}
        description={
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            <li>{t('Чернетка — усе: опис, кошторис, місце, файли. Видно лише вам.')}</li>
            <li>{t('Подано, на модерації, на експертизі — нічого, проєкт чекає рішення.')}</li>
            <li>{t('На доопрацюванні — усе, потім «Подати повторно». Номер проєкту зберігається.')}</li>
            <li>{t('Опубліковано і далі — нічого, проєкт бере участь у голосуванні або реалізується.')}</li>
          </ul>
        }
      />
      <Card>
        <LoadState loading={loading} error={error}>
          <Table
            rowKey="projectId"
            dataSource={data ?? []}
            pagination={false}
            scroll={{ x: 820 }}
            locale={{ emptyText: <Empty description={t('Ви ще не створили жодного проєкту')} /> }}
            columns={[
              {
                title: t('Проєкт'),
                render: (_, p) => (
                  <>
                    <Link
                      to={
                        EDITABLE.includes(p.status)
                          ? `/my/projects/${p.projectId}`
                          : `/projects/${p.projectId}`
                      }
                    >
                      <b>{p.title}</b>
                    </Link>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                      {p.regNumber ?? t('без номера')} · {t(p.categoryName)} · {t(p.districtName)}
                    </div>
                    {p.status === 'revision' && p.lastComment && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 8, padding: '4px 10px' }}
                        message={
                          <span>
                            <b>{t('Коментар модератора')}:</b> {p.lastComment}
                          </span>
                        }
                      />
                    )}
                  </>
                ),
              },
              {
                title: t('Вартість'),
                dataIndex: 'cost',
                align: 'right',
                width: 140,
                render: (v: number) => formatMoney(v),
              },
              {
                title: t('Статус'),
                dataIndex: 'status',
                width: 160,
                render: (s: string) => <StatusTag status={s} />,
              },
              {
                title: t('Оновлено'),
                dataIndex: 'updatedAt',
                width: 150,
                render: (v: string) => (
                  <Typography.Text type="secondary">{formatDateTime(v)}</Typography.Text>
                ),
              },
              {
                title: '',
                width: 150,
                render: (_, p) =>
                  EDITABLE.includes(p.status) ? (
                    <Button
                      type="primary"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => navigate(`/my/projects/${p.projectId}`)}
                    >
                      {p.status === 'revision' ? t('Доопрацювати') : t('Редагувати')}
                    </Button>
                  ) : (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [{ key: 'view', icon: <EyeOutlined />, label: t('Переглянути картку') }],
                        onClick: () => navigate(`/projects/${p.projectId}`),
                      }}
                    >
                      <Button size="small" icon={<MoreOutlined />} aria-label={t('Дії')} />
                    </Dropdown>
                  ),
              },
            ]}
          />
        </LoadState>
      </Card>
    </>
  )
}
