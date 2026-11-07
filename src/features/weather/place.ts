import type { Activity, WeatherPlace } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { activityLabel } from '../activities/activities'
import { roundCoord } from './forecast'

/** Where the forecast is for: the place the user picked, or (until then) the latest outdoor activity's start. */
export interface ResolvedPlace extends WeatherPlace {
  source: 'chosen' | 'activity'
  /** For the fallback: the activity it came from ("Corrida de 5/11"). */
  activity?: { id: string; label: string }
}

/** The name of the fallback place on screen. */
export const FALLBACK_NAME = 'Última atividade ao ar livre'

/** The place from the start of an activity's route, rounded like its weather is (about 1 km). */
export function placeFromActivity(
  activity: Pick<Activity, 'id' | 'date' | 'sport' | 'subSport'>,
  [lat, lon]: [number, number],
): ResolvedPlace {
  return {
    name: FALLBACK_NAME,
    lat: roundCoord(lat),
    lon: roundCoord(lon),
    source: 'activity',
    activity: { id: activity.id, label: `${activityLabel(activity)} de ${formatDay(activity.date, 'd/MM')}` },
  }
}

/** A place picked by the user, rounded before it's stored or sent anywhere. */
export const chosenPlace = (place: WeatherPlace): ResolvedPlace => ({
  name: place.name,
  lat: roundCoord(place.lat),
  lon: roundCoord(place.lon),
  source: 'chosen',
})

/** Open-Meteo's search of places by name, in Portuguese. */
export const geocodeUrl = (query: string): string =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=8&language=pt&format=json`

/** Brazilian states by name, for "Porto Alegre, RS". */
const STATES: Record<string, string> = {
  Acre: 'AC',
  Alagoas: 'AL',
  Amapá: 'AP',
  Amazonas: 'AM',
  Bahia: 'BA',
  Ceará: 'CE',
  'Distrito Federal': 'DF',
  'Espírito Santo': 'ES',
  Goiás: 'GO',
  Maranhão: 'MA',
  'Mato Grosso': 'MT',
  'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG',
  Pará: 'PA',
  Paraíba: 'PB',
  Paraná: 'PR',
  Pernambuco: 'PE',
  Piauí: 'PI',
  'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS',
  Rondônia: 'RO',
  Roraima: 'RR',
  'Santa Catarina': 'SC',
  'São Paulo': 'SP',
  Sergipe: 'SE',
  Tocantins: 'TO',
}

/** A search result: the place to store and, to tell apart the ones of the same name, where it is. */
export interface PlaceResult extends WeatherPlace {
  id: string
  /** "Alto Parnaíba, Maranhão, Brasil". */
  detail: string
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/**
 * The places found, as kept: "Porto Alegre, RS" in Brazil, "Lisboa, Portugal" elsewhere. Places that
 * round to the same spot come once.
 */
export function readPlaces(json: unknown): PlaceResult[] {
  const results = json && typeof json === 'object' ? (json as { results?: unknown }).results : undefined
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  const places: PlaceResult[] = []
  for (const result of results) {
    if (!result || typeof result !== 'object') continue
    const row = result as Record<string, unknown>
    const name = text(row.name)
    const latitude = finite(row.latitude)
    const longitude = finite(row.longitude)
    if (!name || latitude === undefined || longitude === undefined) continue
    const [lat, lon] = [roundCoord(latitude), roundCoord(longitude)]
    const key = `${lat},${lon}`
    if (seen.has(key)) continue
    seen.add(key)
    const [admin1, admin2, country] = [text(row.admin1), text(row.admin2), text(row.country)]
    const brazil = row.country_code === 'BR'
    const state = brazil && admin1 ? STATES[admin1] : undefined
    const region = state ?? (brazil ? admin1 : country)
    places.push({
      id: String(row.id ?? key),
      name: region && region !== name ? `${name}, ${region}` : name,
      lat,
      lon,
      detail: [admin2 !== name ? admin2 : undefined, admin1, country].filter(Boolean).join(', '),
    })
  }
  return places
}
