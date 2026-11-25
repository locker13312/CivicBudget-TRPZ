import { AppstoreOutlined, EnvironmentOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  InputNumber,
  Pagination,
  Row,
  Segmented,
  Select,
  Skeleton,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, query } from '../api/client'
import type { Campaign, MapPoint, PagedResult, ProjectListItem, References } from '../api/types'
import { ExportButton, LoadState, PageTitle, useLoad } from '../components/common'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectsMap } from '../components/ProjectMap'

const PAGE_SIZE = 9

/** Каталог проєктів: фільтри живуть в адресному рядку (?categoryId=…), щоб посилання можна було передати. */
export function CatalogPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'map' ? 'map' : 'list'
  const page = Number(params.get('page') ?? 1)
  const [search, setSearch] = useState(params.get('search') ?? '')

  const refs = useLoad(
    async () => ({
      refs: await api<References>('/api/reference'),
      campaigns: await api<Campaign[]>('/api/campaigns'),
      current: await api<Campaign>('/api/campaigns/current').catch(() => null),
    }),
    [],
  )

  // кампанія за замовчуванням — поточна; "all" — усі кампанії
  const campaignParam = params.get('campaignId')
  const campaignId =
    campaignParam === 'all' ? undefined : (campaignParam ?? refs.data?.current?.campaignId?.toString())

  const filter = useMemo(
    () => ({
      campaignId,
      search: params.get('search') ?? undefined,
      categoryId: params.get('categoryId') ?? undefined,
      districtId: params.get('districtId') ?? undefined,
      minCost: params.get('minCost') ?? undefined,
      maxCost: params.get('maxCost') ?? undefined,
      sort: params.get('sort') ?? undefined,
    }),
    [params, campaignId],
  )
  const ready = !!refs.data

  const list = useLoad(
    () =>
      ready && view === 'list'
        ? api<PagedResult<ProjectListItem>>(`/api/projects${query({ ...filter, page, pageSize: PAGE_SIZE })}`)
        : Promise.resolve(null),
    [ready, view, filter, page],
  )
  const map = useLoad(
    () =>
      ready && view === 'map' ? api<MapPoint[]>(`/api/projects/map${query(filter)}`) : Promise.resolve(null),
    [ready, view, filter],
  )

  useEffect(() => setSearch(params.get('search') ?? ''), [params])

  const set = (key: string, value: string | number | null | undefined) => {
    const next = new URLSearchParams(params)
    if (value === null || value === undefined || value === '') next.delete(key)
    else next.set(key, String(value))
    if (key !== 'page' && key !== 'view') next.delete('page')
    setParams(next, { replace: true })
  }

  const maxVotes = Math.max(1, ...(list.data?.items.map((p) => p.totalVotes) ?? [1]))

  return (
    <>
      <PageTitle
        title={t('Проєкти')}
        subtitle={t('Пошук, фільтри та перегляд проєктів на карті міста')}
        help="catalog"
        extra={
          <>
            <Segmented
              value={view}
              onChange={(v) => set('view', v === 'list' ? null : v)}
              options={[
                { value: 'list', icon: <AppstoreOutlined />, label: t('Список') },
                { value: 'map', icon: <EnvironmentOutlined />, label: t('Карта') },
              ]}
            />
            <ExportButton path={`/api/reports/catalog${query(filter)}`} label="Експорт за фільтром" />
          </>
        }
      />

      <LoadState loading={refs.loading} error={refs.error}>
        {refs.data && (
          <Card style={{ marginBottom: 20 }} styles={{ body: { paddingBottom: 8 } }}>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12} lg={8}>
                <Input.Search
                  placeholder={t('Назва, опис або номер GB-…')}
                  allowClear
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onSearch={(v) => set('search', v.trim())}
                  enterButton={<SearchOutlined />}
                  aria-label={t('Пошук')}
                />
              </Col>
              <Col xs={12} md={6} lg={4}>
                <Select
                  style={{ width: '100%' }}
                  value={campaignParam === 'all' ? 'all' : campaignId}
                  onChange={(v) => set('campaignId', v)}
                  options={[
                    ...refs.data.campaigns.map((c) => ({ value: String(c.campaignId), label: c.name })),
                    { value: 'all', label: t('Усі кампанії') },
                  ]}
                  aria-label={t('Кампанія')}
                />
              </Col>
              <Col xs={12} md={6} lg={4}>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder={t('Категорія')}
                  value={filter.categoryId}
                  onChange={(v) => set('categoryId', v)}
                  options={refs.data.refs.categories.map((c) => ({ value: String(c.id), label: t(c.name) }))}
                />
              </Col>
              <Col xs={12} md={6} lg={4}>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('Район')}
                  value={filter.districtId}
                  onChange={(v) => set('districtId', v)}
                  options={refs.data.refs.districts.map((d) => ({ value: String(d.id), label: t(d.name) }))}
                />
              </Col>
              <Col xs={12} md={6} lg={4}>
                <Select
                  style={{ width: '100%' }}
                  value={filter.sort ?? 'votes'}
                  onChange={(v) => set('sort', v === 'votes' ? null : v)}
                  options={[
                    { value: 'votes', label: t('За голосами') },
                    { value: 'cost', label: t('Дешевші спочатку') },
                    { value: 'cost_desc', label: t('Дорожчі спочатку') },
                    { value: 'new', label: t('Новіші') },
                    { value: 'title', label: t('За назвою') },
                  ]}
                  aria-label={t('Сортування')}
                />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Flex gap={8} align="center">
                  <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                    {t('Вартість, грн')}
                  </Typography.Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    step={50000}
                    placeholder={t('від')}
                    value={filter.minCost ? Number(filter.minCost) : null}
                    onChange={(v) => set('minCost', v)}
                  />
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    step={50000}
                    placeholder={t('до')}
                    value={filter.maxCost ? Number(filter.maxCost) : null}
                    onChange={(v) => set('maxCost', v)}
                  />
                </Flex>
              </Col>
              <Col>
                <Button
                  onClick={() =>
                    setParams(new URLSearchParams(view === 'map' ? { view } : {}), { replace: true })
                  }
                >
                  {t('Скинути фільтри')}
                </Button>
              </Col>
            </Row>
          </Card>
        )}
      </LoadState>

      {view === 'list' ? (
        <LoadState loading={list.loading && !list.data} error={list.error}>
          {list.data &&
            (list.data.items.length === 0 ? (
              <Card>
                <Empty description={t('За цими умовами проєктів не знайдено')} />
              </Card>
            ) : (
              <>
                <Typography.Paragraph type="secondary">
                  {t('Знайдено')}: {list.data.total}
                </Typography.Paragraph>
                <Row gutter={[16, 16]}>
                  {list.data.items.map((p) => (
                    <Col xs={24} sm={12} lg={8} key={p.projectId}>
                      <ProjectCard p={p} maxVotes={maxVotes} />
                    </Col>
                  ))}
                </Row>
                <Flex justify="center" style={{ marginTop: 24 }}>
                  <Pagination
                    current={list.data.page}
                    pageSize={PAGE_SIZE}
                    total={list.data.total}
                    onChange={(p) => set('page', p)}
                    showSizeChanger={false}
                  />
                </Flex>
              </>
            ))}
        </LoadState>
      ) : (
        <Card styles={{ body: { padding: 8 } }}>
          {map.loading && !map.data ? (
            <Skeleton.Node active style={{ width: '100%', height: 520 }} />
          ) : (
            <>
              <ProjectsMap points={map.data ?? []} />
              <Typography.Paragraph type="secondary" style={{ margin: '8px 8px 0' }}>
                {t('На карті')}: {map.data?.length ?? 0}. {t('Натисніть на точку, щоб побачити проєкт.')}
              </Typography.Paragraph>
            </>
          )}
        </Card>
      )}
    </>
  )
}
