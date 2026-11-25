import { CodeOutlined, DownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Collapse, Row, Select, Space, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { api, query } from '../api/client'
import { campaignStatus } from '../api/labels'
import { useAuth } from '../auth/AuthContext'
import { HelpBody } from '../components/help'
import { LoadState, PageTitle, useLoad } from '../components/common'
import { helpRoles, helpTopics } from '../help/topics'

interface OpenDataIndex {
  publisher: string
  license: string
  datasets: { id: string; title: string; formats: string[] }[]
  campaigns: { campaignId: number; campaignYear: number; name: string; status: string }[]
}

/** Відкриті дані: перелік наборів і посилання на JSON / CSV. */
export function OpenDataPage() {
  const { t } = useTranslation()
  const { data, loading, error } = useLoad(() => api<OpenDataIndex>('/api/open-data'), [])
  const [campaignId, setCampaignId] = useState<number | undefined>()
  const origin = window.location.origin

  return (
    <>
      <PageTitle
        title={t('Відкриті дані')}
        subtitle={t('Машиночитані набори даних громадського бюджету без персональних даних')}
        help="openData"
      />
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`${t('Розпорядник')}: ${t(data.publisher)}. ${t('Ліцензія')}: ${data.license}.`}
            />
            <Card style={{ marginBottom: 16 }}>
              <Space wrap>
                <Typography.Text>{t('Кампанія')}:</Typography.Text>
                <Select
                  allowClear
                  placeholder={t('Усі кампанії')}
                  style={{ minWidth: 260 }}
                  value={campaignId}
                  onChange={setCampaignId}
                  options={data.campaigns.map((c) => ({
                    value: c.campaignId,
                    label: `${c.name} · ${t(campaignStatus[c.status])}`,
                  }))}
                />
              </Space>
            </Card>
            <Row gutter={[16, 16]}>
              {data.datasets.map((d) => (
                <Col xs={24} md={12} key={d.id}>
                  <Card title={t(d.title)} extra={<Tag>{d.id}</Tag>}>
                    {d.formats.map((f) => {
                      const url = `/api/open-data/${d.id}${query({ campaignId, format: f })}`
                      return (
                        <Space key={f} style={{ display: 'flex', marginBottom: 8 }} wrap>
                          <Button icon={<DownloadOutlined />} href={url} target="_blank">
                            {f.toUpperCase()}
                          </Button>
                          <Typography.Text code copyable style={{ fontSize: 12 }}>
                            {origin + url}
                          </Typography.Text>
                        </Space>
                      )
                    })}
                  </Card>
                </Col>
              ))}
            </Row>
            <Card
              title={
                <>
                  <CodeOutlined /> {t('Програмний доступ')}
                </>
              }
              style={{ marginTop: 16 }}
            >
              <Typography.Paragraph>
                {t('Повний опис REST API — у Swagger (OpenAPI 3):')}{' '}
                <a href="/swagger" target="_blank" rel="noreferrer">
                  /swagger
                </a>
              </Typography.Paragraph>
              <Table
                size="small"
                pagination={false}
                rowKey="path"
                dataSource={[
                  { path: 'GET /api/open-data', note: t('перелік наборів і кампаній') },
                  { path: 'GET /api/open-data/projects?campaignId=&format=json|csv', note: t('проєкти') },
                  {
                    path: 'GET /api/open-data/results?campaignId=&format=json|csv',
                    note: t('результати голосування'),
                  },
                ]}
                columns={[
                  {
                    title: t('Запит'),
                    dataIndex: 'path',
                    render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
                  },
                  { title: t('Що повертає'), dataIndex: 'note' },
                ]}
              />
            </Card>
          </>
        )}
      </LoadState>
    </>
  )
}

/** Довідка: розділ для кожної ролі; теми ролей поточного користувача розгорнуто. */
export function HelpPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const hash = useLocation().hash.replace('#', '')
  const mine = new Set(['visitor', ...(user?.roles ?? [])])

  return (
    <>
      <PageTitle
        title={t('Довідка')}
        subtitle={t(
          'Як користуватися системою: розділи для кожної ролі. Кнопка «?» на кожній сторінці відкриває довідку саме до неї.',
        )}
      />
      {helpRoles.map((r) => {
        const topics = Object.entries(helpTopics).filter(([, v]) => v.role === r.key)
        if (topics.length === 0) return null
        return (
          <Card key={r.key} title={t(r.title)} style={{ marginBottom: 16 }} id={r.key}>
            <Collapse
              ghost
              defaultActiveKey={hash ? [hash] : mine.has(r.key) ? topics.map(([k]) => k) : []}
              items={topics.map(([key, v]) => ({
                key,
                label: <b>{t(v.title)}</b>,
                children: <HelpBody topic={key} />,
              }))}
            />
          </Card>
        )
      })}
    </>
  )
}
