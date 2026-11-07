import { LocateFixed, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { Button, Card, Field, TextInput } from '../../components/ui'
import type { WeatherPlace } from '../../db/types'
import { tapFeedback } from '../../lib/haptics'
import { FALLBACK_NAME, geocodeUrl, readPlaces, type PlaceResult, type ResolvedPlace } from './place'
import { setWeatherPlace } from './store'

const SEARCH_DELAY_MS = 350
const TIMEOUT_MS = 15_000

/** The places found for a search, or why there are none. */
interface Found {
  query: string
  places?: PlaceResult[]
  failed?: boolean
}

/**
 * Where the forecast is for: the place picked (synced to the other devices), searched by name or
 * taken from the phone's location; until then, the start of the latest outdoor activity.
 */
export function PlaceCard({ place }: { place: ResolvedPlace | null }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found>()
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string>()
  const text = query.trim()
  const searching = text.length >= 2 && found?.query !== text

  // Searches as the name is typed, a moment after the last key; a newer search cancels the older.
  useEffect(() => {
    if (text.length < 2) return
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(async () => {
      const limit = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, TIMEOUT_MS)
      try {
        const response = await fetch(geocodeUrl(text), { signal: controller.signal })
        if (!response.ok) throw new Error(`Open-Meteo ${response.status}`)
        const places = readPlaces(await response.json())
        if (!controller.signal.aborted) setFound({ query: text, places })
      } catch {
        // Cancelled by a newer search: that one answers instead.
        if (timedOut || !controller.signal.aborted) setFound({ query: text, failed: true })
      } finally {
        clearTimeout(limit)
      }
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text])

  const choose = async (next: WeatherPlace) => {
    tapFeedback()
    await setWeatherPlace(next)
    setQuery('')
    setGeoError(undefined)
    toast({ message: `Previsão para ${next.name}.` })
  }

  const locate = () => {
    setGeoError(undefined)
    if (!('geolocation' in navigator)) {
      setGeoError('Este aparelho não informa a localização. Busque a cidade.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        // Stored rounded to about 1 km, like a city picked from the list.
        void choose({ name: 'Minha localização', lat: position.coords.latitude, lon: position.coords.longitude })
      },
      (error) => {
        setLocating(false)
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? 'Sem permissão para a localização. Libere nas permissões do app (ou do navegador), ou busque a cidade.'
            : 'Não deu para achar a localização agora. Tente de novo ou busque a cidade.',
        )
      },
      // The approximate location is enough (and all the Android app asks for).
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 30 * 60_000 },
    )
  }

  const shown = found?.query === text ? found : undefined
  return (
    <Card icon={MapPin} tone="water" title="Local da previsão">
      {place?.source === 'chosen' ? (
        <div className="mb-3">
          <p className="font-medium">{place.name}</p>
          <p className="text-xs text-muted">Vale para esta página e para o clima dos treinos programados, em todos os aparelhos.</p>
        </div>
      ) : place ? (
        <div className="mb-3">
          <p className="font-medium">{FALLBACK_NAME}</p>
          <p className="text-xs text-muted">
            Sem um local escolhido, a previsão é para onde começou a sua última atividade ao ar livre
            {place.activity ? ` (${place.activity.label})` : ''}. Escolha uma cidade para fixar o local.
          </p>
        </div>
      ) : (
        <p className="mb-3 text-sm text-ink-2">
          Escolha a cidade da previsão: ela vale para esta página e para o clima dos treinos programados.
        </p>
      )}

      <Field label="Buscar cidade">
        <TextInput
          type="search"
          value={query}
          placeholder="Ex.: Porto Alegre"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <div aria-live="polite">
        {searching && <p className="mt-2 text-xs text-muted">Buscando…</p>}
        {shown?.failed && <p className="mt-2 text-xs text-ink-2">Não deu para buscar agora. Confira a conexão.</p>}
        {shown?.places?.length === 0 && <p className="mt-2 text-xs text-ink-2">Nenhuma cidade com esse nome.</p>}
      </div>
      {!!shown?.places?.length && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {shown.places.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => void choose(result)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-2 active:opacity-70"
              >
                <MapPin size={16} aria-hidden className="shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{result.name}</span>
                  {result.detail && <span className="block truncate text-xs text-muted">{result.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={locate} disabled={locating}>
          <LocateFixed size={16} /> {locating ? 'Localizando…' : 'Usar minha localização'}
        </Button>
        {place?.source === 'chosen' && (
          <Button variant="ghost" onClick={() => void setWeatherPlace(undefined)}>
            Usar o local da última atividade
          </Button>
        )}
      </div>
      {geoError && <p className="mt-2 text-xs text-critical">{geoError}</p>}
    </Card>
  )
}
