import type { ThemeConfig } from 'antd'

// Власна тема Ant Design: спокійний муніципальний стиль, основний колір — синій.
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1f5c99',
    colorInfo: '#1f5c99',
    colorSuccess: '#2e7d32',
    colorWarning: '#d48806',
    colorError: '#c62828',
    colorLink: '#1f5c99',
    borderRadius: 8,
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    fontSize: 14,
    colorBgLayout: '#f3f6fa',
    // світлі фони повідомлень і тегів (автоматично з темних основних кольорів виходять сіруваті)
    colorInfoBg: '#eaf2fb',
    colorInfoBorder: '#b6d0ee',
    colorSuccessBg: '#edf7ee',
    colorSuccessBorder: '#b7dfba',
    colorWarningBg: '#fff8e6',
    colorWarningBorder: '#f5d78e',
    colorErrorBg: '#fdeeee',
    colorErrorBorder: '#f3b9b9',
  },
  components: {
    Layout: { headerBg: '#ffffff', headerHeight: 64, headerPadding: '0 24px', footerBg: '#eef2f7' },
    Menu: { itemBg: 'transparent', horizontalItemSelectedColor: '#1f5c99' },
    Card: { headerFontSize: 16 },
    Table: { headerBg: '#eef3f9' },
  },
}

/** Кольори статусів — однакові бейджі по всьому застосунку. */
export const statusColor: Record<string, string> = {
  draft: 'default',
  submitted: 'processing',
  moderation: 'processing',
  revision: 'warning',
  expertise: 'purple',
  rejected: 'error',
  published: 'blue',
  winner: 'success',
  not_selected: 'default',
  implementing: 'cyan',
  completed: 'green',
  // кампанія
  submission: 'processing',
  review: 'purple',
  voting: 'blue',
  counting: 'gold',
  implementation: 'cyan',
  closed: 'default',
  // реалізація і звіти
  planned: 'default',
  in_progress: 'processing',
  suspended: 'warning',
  done: 'success',
  accepted: 'success',
}

/** Колір категорії — для обкладинок карток без фото і точок на карті. */
export const categoryColor: Record<number, string> = {
  1: '#5c6bc0',
  2: '#43a047',
  3: '#d81b60',
  4: '#1e88e5',
  5: '#ef6c00',
  6: '#546e7a',
}
