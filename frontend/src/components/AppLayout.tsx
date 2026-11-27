import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BellOutlined,
  BuildOutlined,
  CheckSquareOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  HomeOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Flex,
  Grid,
  Layout,
  Menu,
  Segmented,
  Space,
  Typography,
} from 'antd'
import type { MenuProps } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { roleNames } from '../api/labels'
import { useAuth } from '../auth/AuthContext'
import { setLanguage } from '../i18n'
import { brand } from '../theme'
import { Logo } from './Logo'

type Item = Required<MenuProps>['items'][number]

/** Головне меню залежить від ролей користувача (RBAC). */
function useMenuItems(): Item[] {
  const { t } = useTranslation()
  const { user, hasRole } = useAuth()
  const link = (to: string, label: string, icon: React.ReactNode): Item => ({
    key: to,
    icon,
    label: <Link to={to}>{t(label)}</Link>,
  })

  // спершу пункти ролей (робочі сторінки), потім публічні — щоб на вузькому екрані в «⋯» ховались публічні
  const items: Item[] = [link('/', 'Головна', <HomeOutlined />)]
  if (hasRole('admin'))
    items.push({
      key: 'admin',
      icon: <SettingOutlined />,
      label: t('Адміністрування'),
      children: [
        link('/admin/campaign', 'Кампанія', <SettingOutlined />),
        link('/admin/implementation', 'Реалізація', <BuildOutlined />),
        link('/admin/reports', 'Звіти', <FileTextOutlined />),
        link('/admin/statistics', 'Статистика', <BarChartOutlined />),
        link('/admin/users', 'Користувачі й ролі', <TeamOutlined />),
        link('/admin/audit', 'Журнал аудиту', <DatabaseOutlined />),
      ],
    })
  if (hasRole('moderator')) items.push(link('/moderation', 'Модерація', <AuditOutlined />))
  if (hasRole('expert')) items.push(link('/expertise', 'Експертиза', <ExperimentOutlined />))
  if (hasRole('operator')) items.push(link('/operator', 'Паперові бюлетені', <FileDoneOutlined />))
  if (hasRole('executor')) items.push(link('/executor', 'Кабінет виконавця', <ToolOutlined />))
  if (hasRole('resident')) {
    const residentItems = [
      link('/voting', 'Голосування', <CheckSquareOutlined />),
      link('/my/projects', 'Мої проєкти', <FileTextOutlined />),
    ]
    // кілька ролей: пункти мешканця окремим підменю, щоб було видно, що до якої ролі належить
    if ((user?.roles.length ?? 0) > 1)
      items.push({ key: 'resident', icon: <UserOutlined />, label: t('Мешканець'), children: residentItems })
    else items.push(...residentItems)
  }
  items.push(
    link('/projects', 'Проєкти', <AppstoreOutlined />),
    link('/results', 'Результати', <TrophyOutlined />),
    link('/implementation', 'Хід реалізації', <BuildOutlined />),
  )
  return items
}

function selectedKey(pathname: string): string {
  if (pathname === '/') return '/'
  const keys = [
    '/projects',
    '/results',
    '/implementation',
    '/voting',
    '/my/projects',
    '/moderation',
    '/expertise',
    '/operator',
    '/executor',
    '/admin/campaign',
    '/admin/implementation',
    '/admin/reports',
    '/admin/statistics',
    '/admin/users',
    '/admin/audit',
  ]
  return keys.find((k) => pathname.startsWith(k)) ?? ''
}

export function AppLayout() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const mobile = !screens.lg
  const [drawer, setDrawer] = useState(false)
  const [unread, setUnread] = useState(0)
  const items = useMenuItems()
  const selected = selectedKey(location.pathname)

  useEffect(() => setDrawer(false), [location.pathname])

  useEffect(() => {
    if (!user) return setUnread(0)
    let alive = true
    const load = () =>
      api<{ count: number }>('/api/notifications/unread-count')
        .then((r) => alive && setUnread(r.count))
        .catch(() => undefined)
    void load()
    const timer = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [user, location.pathname])

  const userMenu: MenuProps = {
    items: [
      {
        key: 'who',
        disabled: true,
        label: (
          <div>
            <div style={{ fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>{user?.fullName}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user?.roles.map((r) => t(roleNames[r] ?? r)).join(', ')}
            </Typography.Text>
          </div>
        ),
      },
      { type: 'divider' },
      { key: 'notifications', icon: <BellOutlined />, label: t('Сповіщення') },
      { key: 'help', icon: <QuestionCircleOutlined />, label: t('Довідка') },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: t('Вийти'), danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        logout()
        navigate('/')
      } else navigate('/' + key)
    },
  }

  const right = (
    <Space size={mobile ? 4 : 12}>
      <Segmented
        size="small"
        value={i18n.language === 'en' ? 'en' : 'uk'}
        options={[
          { label: 'UA', value: 'uk' },
          { label: 'EN', value: 'en' },
        ]}
        onChange={(v) => setLanguage(v as 'uk' | 'en')}
        aria-label={t('Мова інтерфейсу')}
      />
      {user ? (
        <>
          <Link to="/notifications" aria-label={t('Сповіщення')}>
            <Badge count={unread} size="small">
              <Button type="text" shape="circle" icon={<BellOutlined style={{ fontSize: 18 }} />} />
            </Badge>
          </Link>
          <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
            <Button type="text" style={{ paddingInline: 6 }}>
              <Avatar size="small" style={{ background: brand.primary }} icon={<UserOutlined />} />
              {!mobile && (
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.fullName}
                </span>
              )}
            </Button>
          </Dropdown>
        </>
      ) : (
        <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
          {t('Увійти')}
        </Button>
      )}
    </Space>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderBottom: '1px solid #e5eaf0',
          paddingInline: mobile ? 12 : 24,
        }}
      >
        {mobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawer(true)}
            aria-label={t('Меню')}
          />
        )}
        <Link
          to="/"
          style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
          aria-label={t('На головну')}
        >
          <Logo compact={mobile && !screens.sm} />
        </Link>
        {!mobile && (
          <Menu
            mode="horizontal"
            items={items}
            selectedKeys={[selected]}
            style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
          />
        )}
        <div style={{ marginInlineStart: 'auto' }}>{right}</div>
      </Layout.Header>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        placement="left"
        width={280}
        title={t('Громадський бюджет')}
      >
        <Menu
          mode="inline"
          items={items}
          selectedKeys={[selected]}
          defaultOpenKeys={['admin', 'resident']}
          style={{ border: 'none' }}
        />
      </Drawer>

      <Layout.Content style={{ padding: mobile ? '16px 12px 32px' : '28px 24px 40px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <Outlet />
        </div>
      </Layout.Content>

      <Layout.Footer style={{ textAlign: 'center' }}>
        <Flex justify="center" gap={16} wrap>
          <span>
            {t('ІС «Громадський бюджет»')} · {t('курсова робота з ТРПЗ')}, {t('КПІ ім. Ігоря Сікорського')},
            2026
          </span>
          <Link to="/open-data">{t('Відкриті дані')}</Link>
          <Link to="/help">{t('Довідка')}</Link>
          <a href="/swagger" target="_blank" rel="noreferrer">
            API (Swagger)
          </a>
        </Flex>
      </Layout.Footer>
    </Layout>
  )
}
