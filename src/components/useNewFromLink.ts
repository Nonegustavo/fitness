import { useEffect, useEffectEvent } from 'react'
import { useSearchParams } from 'react-router'

/**
 * `?novo=<flag>` in the address (the "+" of the screen) runs `open` once, also when the screen is
 * already open; then the flag leaves the address, so going back or reloading doesn't open it again.
 * No flag: nothing to listen for.
 */
export function useNewFromLink(flag: string | undefined, open: () => void) {
  const [params, setParams] = useSearchParams()
  const opened = useEffectEvent(open)
  const asked = flag !== undefined && params.get('novo') === flag
  useEffect(() => {
    if (!asked) return
    opened()
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('novo')
        return next
      },
      { replace: true },
    )
  }, [asked, setParams])
}
