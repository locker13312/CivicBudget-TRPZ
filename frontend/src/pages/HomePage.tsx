import { AppstoreOutlined, CheckSquareOutlined, FileAddOutlined, TrophyOutlined } from '@ant-design/icons'
import { Button, Card, Col, Empty, Flex, Row, Space, Statistic, Steps, Table, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { campaignStatusOrder, formatDate, formatMoney } from '../api/labels'
import type { Campaign, PagedResult, ProjectListItem } from '../api/types'
import { CampaignTag, LoadState, NoCampaign, PageTitle, useLoad } from '../components/common'
import { ProjectCard } from '../components/ProjectCard'

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

  return (
    <>
      <Card
        style={{
          marginBottom: 24,
          background: 'linear-gradient(120deg, #1f5c99 0%, #2f78c2 60%, #4a90d9 100%)',
          border: 'none',
        }}
        styles={{ body: { padding: 28 } }}
      >
        <Flex justify="space-between" wrap gap={16} align="center">
          <div style={{ color: '#fff', maxWidth: 680 }}>
            <Space style={{ marginBottom: 8 }}>
              <CampaignTag status={c.status} />
            </Space>
            <Typography.Title style={{ color: '#fff', margin: 0 }}>{c.name}</Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, margin: '8px 0 0' }}>
              {t(
                'Мешканці пропонують проєкти для свого міста й голосують за найкращі. Переможці реалізуються коштом міського бюджету.',
              )}
            </Typography.Paragraph>
          </div>
          <Space wrap>
            {c.status === 'voting' && (
              <Button size="large" icon={<CheckSquareOutlined />} onClick={() => navigate('/voting')}>
                {t('Голосувати')}
              </Button>
            )}
            {c.status === 'submission' && (
              <Button size="large" icon={<FileAddOutlined />} onClick={() => navigate('/my/projects/new')}>
                {t('Подати проєкт')}
              </Button>
            )}
            <Button size="large" ghost icon={<AppstoreOutlined />} onClick={() => navigate('/projects')}>
              {t('Каталог проєктів')}
            </Button>
          </Space>
        </Flex>
      </Card>

      <PageTitle title={t('Етапи кампанії')} help="home" />
      <Card style={{ marginBottom: 24 }}>
        <Steps
          current={c.status === 'closed' ? list.length : current}
          responsive
          items={list.map((s) => ({ title: t(s.title), description: s.period }))}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('Бюджет кампанії')}
              value={c.totalBudget}
              suffix={t('грн')}
              groupSeparator=" "
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('Вартість проєкту')}
              value={`${(c.minProjectCost / 1000).toFixed(0)}–${(c.maxProjectCost / 1000).toFixed(0)}`}
              suffix={t('тис. грн')}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={t('Голосів у мешканця')}
              value={c.votesPerVoter}
              suffix={`/ ${t('до')} ${c.maxVotesPerProject} ${t('за проєкт')}`}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('Голосувати можна з')} value={c.minVoterAge} suffix={t('років')} />
          </Card>
        </Col>
      </Row>

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
