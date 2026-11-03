import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { useChartTokens } from '../../components/Chart'
import './map.css'

/** The GPS route on an OpenStreetMap map: hollow dot at the start, filled at the end. */
export function ActivityMap({ track }: { track: [number, number][] }) {
  const element = useRef<HTMLDivElement>(null)
  const t = useChartTokens()

  useEffect(() => {
    // The page scrolls with the mouse wheel; zoom stays on the buttons and pinch.
    const map = L.map(element.current!, { scrollWheelZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    const route = L.polyline(track, { color: t.series1, weight: 4, opacity: 0.9, lineJoin: 'round' }).addTo(map)
    const dot = (point: [number, number], fill: string) =>
      L.circleMarker(point, { radius: 6, color: t.series1, weight: 3, fillColor: fill, fillOpacity: 1 }).addTo(map)
    dot(track[0], t.surface)
    dot(track[track.length - 1], t.series1)
    map.fitBounds(route.getBounds(), { padding: [20, 20] })
    return () => {
      map.remove()
    }
  }, [track, t])

  return (
    <>
      {/* isolate: Leaflet's own z-indexes stay inside the map, under the app's bars and dialogs. */}
      <div ref={element} role="img" aria-label="Mapa do percurso" className="isolate h-72 w-full overflow-hidden rounded-xl" />
      <p className="mt-2 text-xs text-muted">Círculo vazado: início · cheio: fim</p>
    </>
  )
}
