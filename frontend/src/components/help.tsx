import { Drawer, Typography } from 'antd'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { helpTopics } from '../help/topics'

// Довідкова система (силабус р.5): кнопка «?» на кожній формі відкриває довідку саме до неї,
// повна довідка з розділами для кожної ролі — на сторінці /help.

const HelpContext = createContext<(topic: string) => void>(() => undefined)

export function HelpProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [topic, setTopic] = useState<string | null>(null)
  const open = useCallback((key: string) => setTopic(key), [])
  const item = topic ? helpTopics[topic] : null

  return (
    <HelpContext.Provider value={open}>
      {children}
      <Drawer
        open={!!item}
        onClose={() => setTopic(null)}
        title={item ? t(item.title) : ''}
        width={440}
      >
        {item && <HelpBody topic={topic!} />}
        <Typography.Paragraph style={{ marginTop: 24 }}>
          <Link to="/help" onClick={() => setTopic(null)}>
            {t('Уся довідка')} →
          </Link>
        </Typography.Paragraph>
      </Drawer>
    </HelpContext.Provider>
  )
}

/** Текст довідки однієї теми: вступ і кроки. */
export function HelpBody({ topic }: { topic: string }) {
  const { t } = useTranslation()
  const item = helpTopics[topic]
  if (!item) return null
  return (
    <>
      <Typography.Paragraph>{t(item.intro)}</Typography.Paragraph>
      {item.steps.length > 0 && (
        <ol style={{ paddingInlineStart: 20 }}>
          {item.steps.map((s) => (
            <li key={s} style={{ marginBottom: 6 }}>
              {t(s)}
            </li>
          ))}
        </ol>
      )}
      {item.note && <Typography.Paragraph type="secondary">{t(item.note)}</Typography.Paragraph>}
    </>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useHelp = () => useContext(HelpContext)
