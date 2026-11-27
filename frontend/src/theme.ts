import type { ThemeConfig } from 'antd'

/**
 * Айдентика: стримана палітра з одним акцентом.
 * primary — основний синій (кнопки, посилання, активні пункти), accent — бурштиновий,
 * лише для знака логотипа й позначок переможців. Решта — нейтральні сірі.
 */
export const brand = {
  primary: '#1f5c99',
  primaryDark: '#174a7c',
  accent: '#e3a21a',
  ink: '#1d2733',
  muted: '#6b7785',
  line: '#e3e8ee',
  bg: '#f5f7fa',
}

export const theme: ThemeConfig = {
  token: {
    colorPrimary: brand.primary,
    colorInfo: brand.primary,
    colorSuccess: '#2e7d32',
    colorWarning: '#c77c02',
    colorError: '#c62828',
    colorLink: brand.primary,
    colorText: brand.ink,
    colorTextSecondary: brand.muted,
    colorBorderSecondary: brand.line,
    borderRadius: 8,
    fontFamily: "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    colorBgLayout: brand.bg,
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
    Layout: { headerBg: '#ffffff', headerHeight: 64, headerPadding: '0 24px', footerBg: '#eef1f5' },
    Menu: { itemBg: 'transparent', horizontalItemSelectedColor: brand.primary },
    Card: { headerFontSize: 16 },
    // робочі таблиці — щільні
    Table: { headerBg: '#f0f3f7', cellPaddingBlockSM: 6, cellPaddingInlineSM: 8 },
    Typography: { titleMarginBottom: '0.4em' },
  },
}

/** Кольори статусів — однакові бейджі по всьому застосунку (проєкт, кампанія, реалізація, звіт). */
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

/** Тон категорії: світлий фон і насичений колір — ті самі, що в демо-ілюстраціях. */
export const categoryTone: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#e3e9f0', fg: '#4a6178' }, // Інфраструктура
  2: { bg: '#e4eddf', fg: '#4f6b3a' }, // Озеленення
  3: { bg: '#efe6ea', fg: '#7a4a5e' }, // Культура
  4: { bg: '#e2e8f2', fg: '#3f5a85' }, // Освіта
  5: { bg: '#f1e9df', fg: '#8a5a2b' }, // Спорт
  6: { bg: '#e5e8ea', fg: '#50606b' }, // Безпека
}

/** Колір точки категорії на карті. */
export const categoryColor: Record<number, string> = Object.fromEntries(
  Object.entries(categoryTone).map(([k, v]) => [k, v.fg]),
)
