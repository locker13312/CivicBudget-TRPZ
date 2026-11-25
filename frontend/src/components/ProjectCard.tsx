import { EnvironmentOutlined, LikeOutlined } from '@ant-design/icons'
import { Card, Flex, Progress, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { formatMoney } from '../api/labels'
import type { ProjectListItem } from '../api/types'
import { ProjectCover, StatusTag } from './common'

/** Картка проєкту в каталозі: фото, статус, категорія, район, вартість, прогрес голосів. */
export function ProjectCard({ p, maxVotes }: { p: ProjectListItem; maxVotes: number }) {
  const { t } = useTranslation()
  return (
    <Link to={`/projects/${p.projectId}`} style={{ display: 'block', height: '100%' }}>
      <Card
        hoverable
        style={{ height: '100%', overflow: 'hidden' }}
        styles={{ body: { padding: 16 } }}
        cover={<ProjectCover photoId={p.photoId} categoryId={p.categoryId} categoryName={t(p.categoryName)} height={150} />}
      >
        <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {p.regNumber} · {t(p.categoryName)}
          </Typography.Text>
          <StatusTag status={p.status} />
        </Flex>
        <Typography.Title level={5} style={{ margin: '0 0 6px', minHeight: 44 }} ellipsis={{ rows: 2 }}>
          {p.title}
        </Typography.Title>
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ minHeight: 44, marginBottom: 8 }}>
          {p.summary}
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ fontSize: 13 }}>
          <span>
            <EnvironmentOutlined /> {t(p.districtName)}
          </span>
          <b>{formatMoney(p.cost)}</b>
        </Flex>
        <Flex align="center" gap={8} style={{ marginTop: 8 }}>
          <LikeOutlined style={{ color: '#1f5c99' }} />
          <Progress
            percent={maxVotes ? Math.round((p.totalVotes / maxVotes) * 100) : 0}
            showInfo={false}
            size="small"
            style={{ flex: 1, margin: 0 }}
          />
          <span style={{ fontSize: 13, minWidth: 28, textAlign: 'right' }}>{p.totalVotes}</span>
        </Flex>
      </Card>
    </Link>
  )
}
