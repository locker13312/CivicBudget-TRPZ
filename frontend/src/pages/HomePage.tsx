import { AppstoreOutlined, CheckSquareOutlined, FileAddOutlined, TrophyOutlined } from '@ant-design/icons'
import { Button, Card, Col, Empty, Grid, Row, Space, Steps, Table, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { campaignStatusOrder, formatDate, formatMoney } from '../api/labels'
import type { Campaign, PagedResult, ProjectListItem } from '../api/types'
import { CampaignTag, LoadState, NoCampaign, PageTitle, useLoad } from '../components/common'
import { ProjectCard } from '../components/ProjectCard'
import { brand } from '../theme'

/** Етапи кампанії зі строками — для шкали на головній. */
function stages(c: Campaign) {
  return [
    {
      key: 'submission',
      title: 'Подання проєктів',
      period: `${formatDate(c.submissionStart)} — ${formatDate(c.submissionEnd)}`,
    },
    {
      key: 'review',
      title: 'Розгляд проєктів',
      period: `${formatDate(c.submissionEnd)} — ${formatDate(c.reviewEnd)}`,
    },
    {
      key: 'voting',
      title: 'Голосування',
      period: `${formatDate(c.votingStart)} — ${formatDate(c.votingEnd)}`,
    },
    {
      key: 'counting',
      title: 'Підрахунок голосів',
      period: `${formatDate(c.votingEnd)} — ${formatDate(c.resultsDate)}`,
    },
    { key: 'implementation', title: 'Реалізація', period: `${formatDate(c.resultsDate)} →` },
  ]
}

export function HomePage() {
  const { data, loading, error } = useLoad(async () => {
    const campaign = await api<Campaign>('/api/campaigns/current').catch(() => null)
    if (!campaign) return { campaign: null, top: null }
    const top = await api<PagedResult<ProjectListItem>>(
      `/api/projects?campaignId=${campaign.campaignId}&sort=votes&pageSize=3`,
    )
    return { campaign, top }
  }, [])

  return (
    <LoadState loading={loading} error={error}>
      {data && !data.campaign && <NoCampaign />}
      {data?.campaign && data.top && <Home campaign={data.campaign} top={data.top} />}
    </LoadState>
  )
}

function Home({ campaign: c, top }: { campaign: Campaign; top: PagedResult<ProjectListItem> }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const idx = campaignStatusOrder.indexOf(c.status)
  const list = stages(c)
  const current = Math.max(
    0,
    list.findIndex((s) => campaignStatusOrder.indexOf(s.key) >= idx),
  )
  const maxVotes = Math.max(1, ...top.items.map((p) => p.totalVotes))
  const screensPad = Grid.useBreakpoint().md ? 32 : 20
  // коли закінчується поточний етап — показуємо поруч зі статусом
  const stageEnd =
    { submission: c.submissionEnd, review: c.reviewEnd, voting: c.votingEnd, counting: c.resultsDate }[
      c.status
    ] ?? null

  return (
    <>
      <Card style={{ marginBottom: 24 }} styles={{ body: { padding: screensPad } }}>
        <Row gutter={[32, 24]} align="middle">
          <Col xs={24} lg={15}>
            <Space style={{ marginBottom: 10 }} wrap>
              <CampaignTag status={c.status} />
              {stageEnd && (
                <Typography.Text type="secondary">
                  {t('до')} {formatDate(stageEnd)}
                </Typography.Text>
              )}
            </Space>
            <Typography.Title style={{ margin: 0, fontSize: 34, letterSpacing: -0.5 }}>
              {c.name}
            </Typography.Title>
            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 16, margin: '10px 0 20px', maxWidth: 620 }}
            >
              {t(
                'Мешканці пропонують проєкти для свого міста й голосують за найкращі. Переможці реалізуються коштом міського бюджету.',
              )}
            </Typography.Paragraph>
            <Space wrap>
              {c.status === 'voting' && (
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckSquareOutlined />}
                  onClick={() => navigate('/voting')}
                >
                  {t('Голосувати')}
                </Button>
              )}
              {c.status === 'submission' && (
                <Button
                  type="primary"
                  size="large"
                  icon={<FileAddOutlined />}
                  onClick={() => navigate('/my/projects/new')}
                >
                  {t('Подати проєкт')}
                </Button>
              )}
              <Button size="large" icon={<AppstoreOutlined />} onClick={() => navigate('/projects')}>
                {t('Каталог проєктів')}
              </Button>
            </Space>
          </Col>
          <Col xs={24} lg={9}>
            <Row gutter={[12, 12]}>
              {[
                [t('Бюджет кампанії'), formatMoney(c.totalBudget)],
                [
                  t('Вартість проєкту'),
                  `${formatMoney(c.minProjectCost)} — ${formatMoney(c.maxProjectCost)}`,
                ],
                [
                  t('Голосів у мешканця'),
                  `${c.votesPerVoter}, ${t('до')} ${c.maxVotesPerProject} ${t('за проєкт')}`,
                ],
                [t('Голосувати можна з'), `${c.minVoterAge} ${t('років')}`],
              ].map(([label, value]) => (
                <Col span={12} key={label}>
                  <div
                    style={{ background: brand.bg, borderRadius: 8, padding: '12px 14px', height: '100%' }}
                  >
                    <div style={{ fontSize: 12, color: brand.muted }}>{label}</div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{value}</div>
                  </div>
                </Col>
              ))}
            </Row>
          </Col>
        </Row>
      </Card>

      <PageTitle title={t('Етапи кампанії')} help="home" />
      <Card style={{ marginBottom: 24 }}>
        <Steps
          current={c.status === 'closed' ? list.length : current}
          responsive
          items={list.map((s) => ({ title: t(s.title), description: s.period }))}
        />
      </Card>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={9}>
          <Card title={t('Ліміти категорій')} style={{ height: '100%' }}>
            <Table
              size="small"
              pagination={false}
              rowKey="categoryId"
              dataSource={c.categories}
              columns={[
                { title: t('Категорія'), dataIndex: 'categoryName', render: (v: string) => t(v) },
                {
                  title: t('Ліміт'),
                  dataIndex: 'budgetLimit',
                  align: 'right',
                  render: (v: number) => formatMoney(v),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            title={t('Лідери голосування')}
            extra={
              <Button type="link" icon={<TrophyOutlined />} onClick={() => navigate('/results')}>
                {t('Усі результати')}
              </Button>
            }
            style={{ height: '100%' }}
          >
            {top.items.length === 0 ? (
              <Empty description={t('Проєктів ще немає')} />
            ) : (
              <Row gutter={[16, 16]}>
                {top.items.map((p) => (
                  <Col xs={24} sm={8} key={p.projectId}>
                    <ProjectCard p={p} maxVotes={maxVotes} />
                  </Col>
                ))}
              </Row>
            )}
          </Card>
        </Col>
      </Row>
    </>
  )
}
