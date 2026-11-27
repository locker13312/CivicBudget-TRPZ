import { useTranslation } from 'react-i18next'
import { brand } from '../theme'

/** Знак: три стовпчики, що ростуть (розподіл бюджету й підтримка мешканців), і точка-акцент. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill={brand.primary} />
      <rect x="7" y="17" width="4.5" height="8" rx="1" fill="#fff" />
      <rect x="13.75" y="13" width="4.5" height="12" rx="1" fill="#fff" />
      <rect x="20.5" y="10" width="4.5" height="15" rx="1" fill="#fff" />
      <circle cx="22.75" cy="6" r="2.2" fill={brand.accent} />
    </svg>
  )
}

/** Логотип із назвою. compact — лише знак (вузький екран). */
export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <LogoMark />
      {!compact && (
        <span style={{ lineHeight: 1.1, whiteSpace: 'nowrap' }}>
          <span
            style={{ display: 'block', fontWeight: 700, fontSize: 16, color: brand.ink, letterSpacing: -0.2 }}
          >
            {t('Громадський бюджет')}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: brand.muted, letterSpacing: 0.4 }}>
            {t('КИЇВ · ПРОЄКТИ МЕШКАНЦІВ')}
          </span>
        </span>
      )}
    </span>
  )
}
