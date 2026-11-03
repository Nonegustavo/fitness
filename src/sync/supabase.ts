import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PulledRecord, Remote } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Null until the project's URL and publishable key are configured (see README). */
export const supabase: SupabaseClient | null =
  url && key
    ? // Login is e-mail + password only; reading tokens from the URL would clash with the hash routes.
      createClient(url, key, { auth: { detectSessionInUrl: false } })
    : null

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async push(records) {
      const { error } = await client.rpc('push_records', { items: records })
      if (error) throw new Error(error.message)
    },
    async pull(afterRev, limit) {
      const { data, error } = await client
        .from('records')
        .select('collection, id, data, updated_at, deleted, rev')
        .gt('rev', afterRev)
        .order('rev')
        .limit(limit)
      if (error) throw new Error(error.message)
      return data as PulledRecord[]
    },
  }
}
