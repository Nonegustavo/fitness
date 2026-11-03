import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

// Minimal stand-ins for what Supabase provides: the API roles, auth.users and auth.uid(),
// and the storage tables the photo bucket's policy lives on.
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (bucket_id text, name text, primary key (bucket_id, name));
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`

const USER_A = '00000000-0000-0000-0000-00000000000a'
const USER_B = '00000000-0000-0000-0000-00000000000b'
const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url))

let pg: PGlite

async function applyMigrations() {
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(migrationsDir + file, 'utf8'))
  }
}

async function asUser<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user])
  await pg.exec('set role authenticated')
  try {
    return (await pg.query<T>(sql, params)).rows
  } finally {
    await pg.exec('reset role')
  }
}

const push = (user: string, items: object[]) =>
  asUser(user, 'select public.push_records($1::jsonb)', [JSON.stringify(items)])

interface Row {
  id: string
  data: { kg: number }
  updated_at: number | string
  deleted: boolean
  rev: number | string
}

const records = (user: string) =>
  asUser<Row>(user, 'select id, data, updated_at, deleted, rev from public.records order by rev')

const weight = (kg: number, updatedAt: number, deleted = false) => ({
  collection: 'weights',
  id: 'w1',
  data: { kg },
  updated_at: updatedAt,
  deleted,
})

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(SUPABASE_STUBS)
  await pg.exec(`insert into auth.users values ('${USER_A}'), ('${USER_B}')`)
  await applyMigrations()
})

describe('records migration', () => {
  it('stores pushed records for the logged-in user', async () => {
    await push(USER_A, [weight(80, 1000)])
    expect(await records(USER_A)).toEqual([expect.objectContaining({ id: 'w1', data: { kg: 80 } })])
  })

  it('ignores a push older than the stored version', async () => {
    const [before] = await records(USER_A)
    await push(USER_A, [weight(79, 500)])
    const [after] = await records(USER_A)
    expect(after.data.kg).toBe(80)
    expect(Number(after.rev)).toBe(Number(before.rev))
  })

  it('applies a newer push and gives it a higher rev', async () => {
    const [before] = await records(USER_A)
    await push(USER_A, [weight(81, 2000, true)])
    const [after] = await records(USER_A)
    expect(after).toMatchObject({ data: { kg: 81 }, deleted: true })
    expect(Number(after.updated_at)).toBe(2000)
    expect(Number(after.rev)).toBeGreaterThan(Number(before.rev))
  })

  it('keeps each user’s records private', async () => {
    await push(USER_B, [weight(60, 1000)])
    expect(await records(USER_B)).toEqual([expect.objectContaining({ data: { kg: 60 } })])
    expect((await records(USER_A))[0].data.kg).toBe(81)
  })

  it('rejects pushes without a logged-in user', async () => {
    await pg.exec('set role anon')
    try {
      await expect(pg.query('select public.push_records($1::jsonb)', ['[]'])).rejects.toThrow()
    } finally {
      await pg.exec('reset role')
    }
  })

  it('can be applied again without errors', async () => {
    await expect(applyMigrations()).resolves.toBeUndefined()
  })
})

describe('garmin token migration', () => {
  const token = (user: string) =>
    asUser<{ token: string }>(user, 'select token from public.garmin_token')

  it('lets each user keep one token, replaced on the next save', async () => {
    const save = (value: string) =>
      asUser(
        USER_A,
        `insert into public.garmin_token (user_id, token, expires_at) values ($1, $2, now() + interval '1 day')
         on conflict (user_id) do update set token = excluded.token, expires_at = excluded.expires_at`,
        [USER_A, value],
      )
    await save('first')
    await save('second')
    expect(await token(USER_A)).toEqual([{ token: 'second' }])
  })

  it('keeps the token private', async () => {
    expect(await token(USER_B)).toEqual([])
    await expect(
      asUser(USER_B, `insert into public.garmin_token (user_id, token, expires_at) values ($1, 'x', now())`, [USER_A]),
    ).rejects.toThrow()
  })
})

describe('food photos migration', () => {
  const upload = (user: string, name: string) =>
    asUser(user, `insert into storage.objects (bucket_id, name) values ('fotos', $1)`, [name])
  const list = (user: string) => asUser<{ name: string }>(user, `select name from storage.objects order by name`)

  it('creates a private bucket for JPEG photos', async () => {
    const rows = (await pg.query<{ public: boolean; allowed_mime_types: string[] }>(
      `select public, allowed_mime_types from storage.buckets where id = 'fotos'`,
    )).rows
    expect(rows).toEqual([{ public: false, allowed_mime_types: ['image/jpeg'] }])
  })

  it('lets each user read and write only their own folder', async () => {
    await upload(USER_A, `${USER_A}/prato.jpg`)
    await expect(upload(USER_B, `${USER_A}/intruso.jpg`)).rejects.toThrow()
    await expect(upload(USER_A, 'solta.jpg')).rejects.toThrow()
    expect(await list(USER_A)).toEqual([{ name: `${USER_A}/prato.jpg` }])
    expect(await list(USER_B)).toEqual([])
  })
})
