import {
  BranchesOutlined,
  CarOutlined,
  CustomerServiceOutlined,
  DribbbleOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  TagOutlined,
} from '@ant-design/icons'
import { Tag } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { categoryTone } from '../theme'

// Іконки категорій — з однієї бібліотеки (@ant-design/icons); ключ — CategoryId з довідника Category.
const icons: Record<number, ReactNode> = {
  1: <CarOutlined />, // Інфраструктура
  2: <BranchesOutlined />, // Озеленення
  3: <CustomerServiceOutlined />, // Культура
  4: <ReadOutlined />, // Освіта
  5: <DribbbleOutlined />, // Спорт
  6: <SafetyCertificateOutlined />, // Безпека
}

// eslint-disable-next-line react-refresh/only-export-components
export const categoryIcon = (id: number) => icons[id] ?? <TagOutlined />

/** Тег категорії з іконкою й тоном категорії. */
export function CategoryTag({ id, name }: { id: number; name: string }) {
  const { t } = useTranslation()
  const tone = categoryTone[id]
  return (
    <Tag
      icon={categoryIcon(id)}
      style={{ background: tone?.bg, color: tone?.fg, borderColor: 'transparent', marginInlineEnd: 0 }}
    >
      {t(name)}
    </Tag>
  )
}
