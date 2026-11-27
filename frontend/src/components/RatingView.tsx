import { InfoCircleOutlined } from '@ant-design/icons'
import { Alert, Progress, Table, Tag, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { formatMoney } from '../api/labels'
import type { RatingResponse, WinnerRow } from '../api/types'

/**
 * Рейтинг за категоріями: місце, голоси, вартість, залишок ліміту перед проєктом і причина відбору.
 * Залишок бюджету категорій — з табличної функції dbo.fn_CategoryBudgetBalance.
 */
export function RatingView({ rating }: { rating: RatingResponse }) {
  const { t } = useTranslation()
  const groups = new Map<string, WinnerRow[]>()
  for (const r of rating.rows) groups.set(r.categoryName, [...(groups.get(r.categoryName) ?? []), r])

  return (
    <>
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16 }}
        message={t('Як відбираються переможці')}
        description={
          <>
            {t(
              'У кожній категорії проєкти впорядковано за кількістю голосів. Проєкт проходить, якщо має хоча б один голос і його вартість вміщується в залишок ліміту категорії; інакше черга переходить до наступного.',
            )}{' '}
            {t(rating.tieRule)}
            {!rating.final && (
              <div style={{ marginTop: 6 }}>
                <b>
                  {t(
                    'Це попередній розрахунок: остаточно переможців визначить кнопка «Визначити переможців».',
                  )}
                </b>
              </div>
            )}
          </>
        }
      />

      {rating.final && rating.balances.length > 0 && (
        <Table
          size="small"
          rowKey="categoryId"
          pagination={false}
          dataSource={rating.balances}
          scroll={{ x: 620 }}
          style={{ marginBottom: 24 }}
          title={() => <b>{t('Бюджет категорій')}</b>}
          columns={[
            { title: t('Категорія'), dataIndex: 'categoryName', render: (v: string) => t(v) },
            {
              title: t('Ліміт'),
              dataIndex: 'budgetLimit',
              align: 'right',
              render: (v: number) => formatMoney(v),
            },
            { title: t('Переможців'), dataIndex: 'winners', align: 'right', width: 110 },
            {
              title: t('Використано'),
              dataIndex: 'used',
              align: 'right',
              render: (v: number) => formatMoney(v),
            },
            {
              title: t('Залишок'),
              dataIndex: 'balance',
              align: 'right',
              render: (v: number) => <b>{formatMoney(v)}</b>,
            },
            {
              title: '',
              width: 140,
              render: (_, b) => (
                <Progress
                  percent={Math.round((b.used / b.budgetLimit) * 100)}
                  size="small"
                  showInfo={false}
                />
              ),
            },
          ]}
        />
      )}

      {[...groups.entries()].map(([cat, rows]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <Typography.Title level={5} style={{ marginBottom: 8 }}>
            {t(cat)} · {t('ліміт')} {formatMoney(rows[0].categoryLimit)}
          </Typography.Title>
          <Table
            size="small"
            rowKey="projectId"
            pagination={false}
            dataSource={rows}
            scroll={{ x: 760 }}
            rowClassName={(r) => (r.isWinner ? 'row-winner' : '')}
            columns={[
              { title: t('Місце'), dataIndex: 'place', width: 64 },
              {
                title: t('Проєкт'),
                render: (_, r) => (
                  <Link to={`/projects/${r.projectId}`}>
                    {r.regNumber} {r.title}
                  </Link>
                ),
              },
              {
                title: t('Голоси'),
                align: 'right',
                width: 90,
                render: (_, r) => (
                  <Tooltip title={`${t('виборців')}: ${r.voterCount}`}>
                    <span>{r.votes}</span>
                  </Tooltip>
                ),
              },
              {
                title: t('Вартість'),
                dataIndex: 'cost',
                align: 'right',
                width: 130,
                render: (v: number) => formatMoney(v),
              },
              {
                title: t('Залишок ліміту'),
                dataIndex: 'balanceBefore',
                align: 'right',
                width: 140,
                render: (v: number) => formatMoney(v),
              },
              {
                title: t('Результат'),
                width: 230,
                render: (_, r) => (
                  <>
                    <Tag color={r.isWinner ? 'success' : 'default'}>
                      {r.isWinner ? t('Переможець') : t('Не відібрано')}
                    </Tag>
                    {!r.isWinner && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{t(r.reason)}</div>
                    )}
                  </>
                ),
              },
            ]}
          />
        </div>
      ))}
    </>
  )
}
