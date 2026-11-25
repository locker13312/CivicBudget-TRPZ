import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp, ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import ukUA from 'antd/locale/uk_UA'
import dayjs from 'dayjs'
import 'dayjs/locale/uk'
import { useTranslation } from 'react-i18next'
import App from './App'
import './i18n'
import './index.css'
import { theme } from './theme'

// eslint-disable-next-line react-refresh/only-export-components
function Root() {
  const { i18n } = useTranslation()
  const en = i18n.language === 'en'
  dayjs.locale(en ? 'en' : 'uk')
  return (
    <ConfigProvider theme={theme} locale={en ? enUS : ukUA}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
