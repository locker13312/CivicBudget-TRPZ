import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'

// Інтерфейс українською з перемикачем на англійську (ТЗ ч.1 п.4.8).
// Ключі — самі українські рядки: якщо перекладу немає, показується українська.
const LANG_KEY = 'civic-budget-lang'

function savedLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) ?? 'uk'
  } catch {
    return 'uk'
  }
}

void i18n.use(initReactI18next).init({
  resources: { uk: { translation: {} }, en: { translation: en } },
  lng: savedLang(),
  fallbackLng: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

export function setLanguage(lng: 'uk' | 'en') {
  try {
    localStorage.setItem(LANG_KEY, lng)
  } catch {
    /* приватний режим браузера */
  }
  void i18n.changeLanguage(lng)
  document.documentElement.lang = lng
}

document.documentElement.lang = i18n.language

export default i18n
