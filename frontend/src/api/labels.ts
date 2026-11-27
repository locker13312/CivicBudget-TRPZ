import i18n from '../i18n'

// Українські назви статусів і кодів, форматування сум і дат

export const projectStatus: Record<string, string> = {
  draft: 'Чернетка',
  submitted: 'Подано',
  moderation: 'На модерації',
  revision: 'На доопрацюванні',
  expertise: 'На експертизі',
  rejected: 'Відхилено',
  published: 'Опубліковано',
  winner: 'Переможець',
  not_selected: 'Не відібрано',
  implementing: 'Реалізується',
  completed: 'Реалізовано',
}

export const campaignStatus: Record<string, string> = {
  draft: 'Підготовка',
  submission: 'Подання проєктів',
  review: 'Розгляд проєктів',
  voting: 'Голосування',
  counting: 'Підрахунок голосів',
  implementation: 'Реалізація',
  closed: 'Закрито',
}

export const campaignStatusOrder = [
  'draft',
  'submission',
  'review',
  'voting',
  'counting',
  'implementation',
  'closed',
]

export const roleNames: Record<string, string> = {
  resident: 'Мешканець',
  moderator: 'Модератор',
  expert: 'Експерт',
  operator: 'Оператор',
  executor: 'Виконавець',
  admin: 'Адміністратор',
}

export const reviewType: Record<string, string> = {
  moderation: 'Модерація',
  technical: 'Технічна експертиза',
  legal: 'Юридична експертиза',
  financial: 'Фінансова експертиза',
}

export const decisionNames: Record<string, string> = {
  approve: 'Допущено',
  revise: 'На доопрацювання',
  reject: 'Відхилено',
}

export const verificationNames: Record<string, string> = {
  verified: 'Верифіковано',
  pending: 'Очікує верифікації',
  rejected: 'Відмовлено',
}

export const methodNames: Record<string, string> = { bankid: 'BankID', diia: 'Дія', passport: 'Паспорт' }

export const auditActions: Record<string, string> = {
  project_status: 'Зміна статусу проєкту',
  login: 'Вхід (пароль)',
  login_bankid: 'Вхід (BankID демо)',
  campaign_status: 'Зміна етапу кампанії',
  campaign_update: 'Зміна параметрів кампанії',
  campaign_create: 'Створення кампанії',
  user_roles: 'Зміна ролей',
  user_block: 'Блокування',
  user_unblock: 'Розблокування',
  user_autoblock: 'Автоблокування (5 невдалих входів)',
  user_2fa_on: 'Увімкнено 2FA',
  user_2fa_off: 'Вимкнено 2FA',
  login_2fa: 'Вхід (код 2FA)',
  login_2fa_sent: 'Надіслано код 2FA',
  moderator_assign: 'Призначення модератора',
  register: 'Реєстрація',
  pd_view: 'Перегляд персональних даних',
  stage_update: 'Оновлення етапу реалізації',
  report_submit: 'Звіт виконавця',
  report_accept: 'Звіт прийнято',
  report_reject: 'Звіт повернуто',
  implementation_status: 'Статус реалізації',
}

const isEn = () => i18n.language === 'en'
const locale = () => (isEn() ? 'en-GB' : 'uk-UA')

export const formatMoney = (v: number) =>
  `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(v)} ${isEn() ? 'UAH' : 'грн'}`

/** Дата у форматі dd.MM.yyyy (і в англійському інтерфейсі — так само, щоб таблиці не розходилися). */
export const formatDate = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Дата з часом: 27.11.2026 14:30 */
export const formatDateTime = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  return `${formatDate(s)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Строк модерації — 10 робочих днів від подання (ТЗ ч.2 п.2.1, ПЦ-11). */
export const MODERATION_WORKING_DAYS = 10

const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6

/** Дата, що настає через n робочих днів (без суботи й неділі). */
export function addWorkingDays(from: Date, n: number) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let left = n
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    if (isWorkday(d)) left--
  }
  return d
}

/** Робочих днів між датами: додатне — лишилось, від'ємне — прострочено. */
export function workingDaysUntil(deadline: Date, today = new Date()) {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const b = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate())
  const sign = b >= a ? 1 : -1
  let n = 0
  const d = new Date(sign > 0 ? a : b)
  const end = sign > 0 ? b : a
  while (d < end) {
    d.setDate(d.getDate() + 1)
    if (isWorkday(d)) n++
  }
  return sign * n
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export const votesWord = (n: number) =>
  isEn() ? `${n} ${n === 1 ? 'vote' : 'votes'}` : `${n} ${plural(n, 'голос', 'голоси', 'голосів')}`

export const daysWord = (n: number) =>
  isEn()
    ? `${n} working ${n === 1 ? 'day' : 'days'}`
    : `${n} ${plural(n, 'робочий день', 'робочі дні', 'робочих днів')}`

export const implementationStatus: Record<string, string> = {
  planned: 'Заплановано',
  in_progress: 'Виконується',
  suspended: 'Призупинено',
  completed: 'Завершено',
}

export const stageStatus: Record<string, string> = {
  planned: 'Заплановано',
  in_progress: 'Виконується',
  done: 'Виконано',
}

export const reportStatus: Record<string, string> = {
  submitted: 'На розгляді',
  accepted: 'Прийнято',
  rejected: 'Повернуто',
}
