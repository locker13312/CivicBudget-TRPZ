import 'leaflet/dist/leaflet.css'
import type { LatLngExpression, LeafletMouseEvent } from 'leaflet'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { formatMoney, projectStatus } from '../api/labels'
import type { MapPoint } from '../api/types'

// Карта OpenStreetMap (ТЗ ч.1 п.4.8) на Leaflet. Точки — кола кольору статусу (без файлів іконок).

export const KYIV: LatLngExpression = [50.4501, 30.5234]
const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const pointColor: Record<string, string> = {
  published: '#1f5c99',
  winner: '#2e7d32',
  implementing: '#00838f',
  completed: '#43a047',
  not_selected: '#8c8c8c',
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) map.setView([points[0].latitude, points[0].longitude], 14)
    else map.fitBounds(points.map((p) => [p.latitude, p.longitude] as [number, number]), { padding: [40, 40], maxZoom: 14 })
  }, [map, points])
  return null
}

/** Проєкти каталогу на карті міста. */
export function ProjectsMap({ points, height = 520 }: { points: MapPoint[]; height?: number }) {
  const { t } = useTranslation()
  return (
    <MapContainer center={KYIV} zoom={11} style={{ height, width: '100%', borderRadius: 8 }} scrollWheelZoom>
      <TileLayer url={TILE} attribution={ATTR} />
      <FitBounds points={points} />
      {points.map((p) => (
        <CircleMarker
          key={p.projectId}
          center={[p.latitude, p.longitude]}
          radius={10}
          pathOptions={{ color: '#fff', weight: 2, fillColor: pointColor[p.status] ?? '#1f5c99', fillOpacity: 0.95 }}
        >
          <Tooltip>{p.title}</Tooltip>
          <Popup>
            <div style={{ minWidth: 200 }}>
              <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                {p.regNumber} · {t(p.categoryName)}
              </div>
              <div style={{ fontWeight: 600, margin: '4px 0' }}>{p.title}</div>
              <div>
                {formatMoney(p.cost)} · {t(projectStatus[p.status] ?? p.status)} · {p.totalVotes} {t('гол.')}
              </div>
              <Link to={`/projects/${p.projectId}`}>{t('Відкрити картку')} →</Link>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}

/** Одна точка (картка проєкту). */
export function SinglePointMap({ lat, lng, height = 260 }: { lat: number; lng: number; height?: number }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} style={{ height, width: '100%', borderRadius: 8 }} scrollWheelZoom={false}>
      <TileLayer url={TILE} attribution={ATTR} />
      <CircleMarker center={[lat, lng]} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1f5c99', fillOpacity: 1 }} />
    </MapContainer>
  )
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e: LeafletMouseEvent) => onPick(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)) })
  return null
}

/** Вибір точки на карті у формі проєкту (Project.Location). */
export function PointPicker({
  lat,
  lng,
  onChange,
  disabled,
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
  disabled?: boolean
}) {
  return (
    <MapContainer
      center={lat != null && lng != null ? [lat, lng] : KYIV}
      zoom={lat != null ? 15 : 11}
      style={{ height: 320, width: '100%', borderRadius: 8, cursor: disabled ? 'default' : 'crosshair' }}
    >
      <TileLayer url={TILE} attribution={ATTR} />
      {!disabled && <ClickHandler onPick={onChange} />}
      {lat != null && lng != null && (
        <CircleMarker center={[lat, lng]} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: '#c62828', fillOpacity: 1 }} />
      )}
    </MapContainer>
  )
}
