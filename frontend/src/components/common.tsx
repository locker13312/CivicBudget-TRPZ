import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { App, Alert, Button, Dropdown, Flex, Result, Skeleton, Space, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, download } from '../api/client'
import { campaignStatus, projectStatus } from '../api/labels'
import { categoryColor, statusColor } from '../theme'
import { useHelp } from './help'

/** Заголовок форми: назва, підзаголовок, кнопка «?» (довідка саме до цієї форми), дії праворуч. */
export function PageTitle({
  title,
  subtitle,
  help,
  extra,
}: {
  title: ReactNode
  subtitle?: ReactNode
  help?: string
  extra?: ReactNode
}) {
  const { t } = useTranslation()
  const openHelp = useHelp()
  return (
    <Flex justify="space-between" align="flex-start" gap={12} wrap style={{ marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <Flex align="center" gap={8}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {help && (
            <Tooltip title={t('Довідка до цієї сторінки')}>
              <Button
                type="text"
                shape="circle"
                icon={<QuestionCircleOutlined />}
                aria-label={t('Довідка')}
                onClick={() => openHelp(help)}
              />
            </Tooltip>
          )}
        </Flex>
        {subtitle && (
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {subtitle}
          </Typography.Paragraph>
        )}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </Flex>
  )
}

/** Однаковий кольоровий бейдж статусу проєкту / кампанії / реалізації. */
export function StatusTag({ status, label }: { status: string; label?: string }) {
  const { t } = useTranslation()
  return (
    <Tag color={statusColor[status] ?? 'default'} style={{ marginInlineEnd: 0 }}>
      {t(label ?? projectStatus[status] ?? status)}
    </Tag>
  )
}

export function CampaignTag({ status }: { status: string }) {
  return <StatusTag status={status} label={campaignStatus[status]} />
}

/** Кнопка «Експорт» з вибором формату: PDF, XLSX, CSV. */
export function ExportButton({ path, label = 'Експорт', size }: { path: string; label?: string; size?: 'small' | 'middle' }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const sep = path.includes('?') ? '&' : '?'
  const run = async (format: string) => {
    setBusy(true)
    try {
      await download(`${path}${sep}format=${format}`, `report.${format}`)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dropdown
      menu={{
        items: [
          { key: 'pdf', icon: <FilePdfOutlined />, label: 'PDF' },
          { key: 'xlsx', icon: <FileExcelOutlined />, label: 'Excel (XLSX)' },
          { key: 'csv', icon: <FileTextOutlined />, label: 'CSV' },
        ],
        onClick: ({ key }) => void run(key),
      }}
    >
      <Button icon={<DownloadOutlined />} loading={busy} size={size}>
        {t(label)}
      </Button>
    </Dropdown>
  )
}

/** Завантаження даних з API: data, loading, error, reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await loadRef.current())
      setError(null)
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps)
  return { data, setData, error, loading, reload }
}

/** Стан завантаження / помилки для сторінки. */
export function LoadState({ loading, error, children }: { loading: boolean; error: ApiError | null; children: ReactNode }) {
  const { t } = useTranslation()
  if (error)
    return (
      <Result
        status={error.status === 404 ? '404' : error.status === 403 ? '403' : 'warning'}
        title={error.status === 404 ? t('Не знайдено') : t('Не вдалося завантажити дані')}
        subTitle={error.message}
      />
    )
  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />
  return <>{children}</>
}

export function ErrorAlert({ error }: { error: string | null }) {
  return error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null
}

/** Обкладинка проєкту: перше фото або кольорова плашка категорії. */
export function ProjectCover({
  photoId,
  categoryId,
  categoryName,
  height = 160,
}: {
  photoId?: number | null
  categoryId: number
  categoryName: string
  height?: number
}) {
  const color = categoryColor[categoryId] ?? '#1f5c99'
  if (photoId)
    return (
      <img
        src={`/api/files/${photoId}`}
        alt=""
        loading="lazy"
        style={{ width: '100%', height, objectFit: 'cover', display: 'block' }}
      />
    )
  return (
    <div
      style={{
        height,
        background: `linear-gradient(135deg, ${color}, ${color}99)`,
        color: '#fff',
        display: 'flex',
        alignItems: 'flex-end',
        padding: 16,
        fontWeight: 600,
        fontSize: 16,
      }}
    >
      {categoryName}
    </div>
  )
}
