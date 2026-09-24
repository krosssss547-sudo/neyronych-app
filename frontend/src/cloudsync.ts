// Синхронизация прогресса между устройствами через облачное хранилище Telegram (CloudStorage).
//
// Профили мини-игр, матриц, скорочтения и достижений по-прежнему лежат в localStorage,
// но теперь ещё и копируются в CloudStorage — оно привязано к аккаунту Telegram и одинаковое
// на телефоне и ПК. При запуске данные устройства и облака объединяются: по каждому счётчику
// берётся большее значение, поэтому прогресс не теряется и не задваивается.

type CloudStorage = {
  getItems(keys: string[], cb: (err: unknown, values?: Record<string, string>) => void): void
  setItem(key: string, value: string, cb?: (err: unknown, ok?: boolean) => void): void
}

export const SYNC_KEYS = {
  games: 'neyronych_games_v1',
  matrix: 'neyronych_matrix_profile_v1',
  reading: 'neyronych_reading_profile_v1',
  meta: 'neyronych_meta_v1',
  seen: 'neyronych_ach_seen_v1',
} as const

const ALL_KEYS: string[] = Object.values(SYNC_KEYS)
const CHUNK_SIZE = 3500          // лимит Telegram — 4096 символов на значение, оставляем запас
const MAX_CHUNKS = 10
const CHUNK_MARK = '#chunks:'
const TIMEOUT_MS = 5000

function getCloud(): CloudStorage | null {
  try {
    const wa = window.Telegram?.WebApp
    if (!wa?.CloudStorage) return null
    if (typeof wa.isVersionAtLeast === 'function' && !wa.isVersionAtLeast('6.9')) return null
    return wa.CloudStorage as CloudStorage
  } catch { return null }
}

function withTimeout<T>(run: (resolve: (v: T) => void, reject: (e: unknown) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cloud timeout')), TIMEOUT_MS)
    try {
      run((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
    } catch (e) { clearTimeout(t); reject(e) }
  })
}

function cloudGet(c: CloudStorage, keys: string[]): Promise<Record<string, string>> {
  return withTimeout((resolve, reject) => {
    c.getItems(keys, (err, values) => (err ? reject(err) : resolve(values ?? {})))
  })
}

function cloudSet(c: CloudStorage, key: string, value: string): Promise<void> {
  return withTimeout((resolve, reject) => {
    c.setItem(key, value, (err) => (err ? reject(err) : resolve()))
  })
}

async function readAll(c: CloudStorage): Promise<Record<string, string>> {
  const base = await cloudGet(c, ALL_KEYS)
  const out: Record<string, string> = {}
  for (const key of ALL_KEYS) {
    const v = base[key] ?? ''
    if (!v.startsWith(CHUNK_MARK)) { out[key] = v; continue }
    const n = Math.min(parseInt(v.slice(CHUNK_MARK.length), 10) || 0, MAX_CHUNKS)
    const partKeys = Array.from({ length: n }, (_, i) => `${key}_c${i}`)
    const parts = n > 0 ? await cloudGet(c, partKeys) : {}
    out[key] = partKeys.map((k) => parts[k] ?? '').join('')
  }
  return out
}

async function writeOne(c: CloudStorage, key: string, json: string): Promise<void> {
  if (json.length <= CHUNK_SIZE) { await cloudSet(c, key, json); return }
  const n = Math.ceil(json.length / CHUNK_SIZE)
  if (n > MAX_CHUNKS) return
  for (let i = 0; i < n; i++) await cloudSet(c, `${key}_c${i}`, json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
  await cloudSet(c, key, `${CHUNK_MARK}${n}`)
}

// ───────── Объединение данных двух устройств ─────────

type Obj = Record<string, any>
const num = (x: unknown): number => Number(x) || 0
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)

function mergeKinds(a: unknown, b: unknown): Obj {
  const A = isObj(a) ? a : {}
  const B = isObj(b) ? b : {}
  const out: Obj = {}
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    out[k] = { t: Math.max(num(A[k]?.t), num(B[k]?.t)), c: Math.max(num(A[k]?.c), num(B[k]?.c)) }
  }
  return out
}

function maxFields(a: Obj, b: Obj, fields: string[]): Obj {
  const out: Obj = {}
  for (const f of fields) out[f] = Math.max(num(a[f]), num(b[f]))
  return out
}

function mergeGameProfile(a: Obj, b: Obj): Obj {
  return { ...maxFields(a, b, ['points', 'solved', 'total', 'bestCombo', 'fast']), kinds: mergeKinds(a.kinds, b.kinds) }
}

const MERGERS: Record<string, (a: any, b: any) => unknown> = {
  [SYNC_KEYS.games]: (a: Obj, b: Obj) => {
    const out: Obj = {}
    for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out[t] = mergeGameProfile(isObj(a[t]) ? a[t] : {}, isObj(b[t]) ? b[t] : {})
    }
    return out
  },
  [SYNC_KEYS.matrix]: (a: Obj, b: Obj) => ({ ...maxFields(a, b, ['points', 'solved']), kinds: mergeKinds(a.kinds, b.kinds) }),
  [SYNC_KEYS.reading]: (a: Obj, b: Obj) => ({
    ...maxFields(a, b, ['solved', 'total', 'peakWpm']),
    recent: (num(a.solved) >= num(b.solved) ? a.recent : b.recent) ?? [],
    kinds: mergeKinds(a.kinds, b.kinds),
  }),
  [SYNC_KEYS.meta]: (a: Obj, b: Obj) => maxFields(a, b, ['perfectSeries']),
  [SYNC_KEYS.seen]: (a: unknown[], b: unknown[]) => [...new Set([...a, ...b].map(String))],
}

function parse(raw: string | null | undefined, key: string): any {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (key === SYNC_KEYS.seen) return Array.isArray(v) ? v : null
    return isObj(v) ? v : null
  } catch { return null }
}

export function mergeRaw(key: string, localRaw: string | null, remoteRaw: string | null): string | null {
  const a = parse(localRaw, key)
  const b = parse(remoteRaw, key)
  if (a === null && b === null) return null
  if (a === null) return remoteRaw
  if (b === null) return localRaw
  return JSON.stringify(MERGERS[key](a, b))
}

// ───────── Отправка изменений в облако ─────────

let synced = false
const pending = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | undefined
let flushing = false

async function flush(): Promise<void> {
  if (!synced || flushing || pending.size === 0) return
  const c = getCloud()
  if (!c) return
  flushing = true
  try {
    const items = [...pending]
    pending.clear()
    for (const [k, v] of items) {
      try { await writeOne(c, k, v) } catch { if (!pending.has(k)) pending.set(k, v) }
    }
  } finally { flushing = false }
}

// Вызывается из save*-функций профилей: копирует новое значение в облако (с небольшой задержкой).
export function cloudSave(key: string, json: string): void {
  pending.set(key, json)
  if (!synced) return   // до первой синхронизации ничего не отправляем, чтобы не затереть облако
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void flush() }, 1500)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}

// Запускается один раз при старте приложения. Возвращает true, если данные на устройстве изменились
// (тогда приложению нужно перечитать профили из localStorage).
export async function syncFromCloud(): Promise<boolean> {
  const c = getCloud()
  if (!c) return false
  let remote: Record<string, string>
  try { remote = await readAll(c) } catch { return false }

  let changed = false
  for (const key of ALL_KEYS) {
    let localRaw: string | null = null
    try { localRaw = localStorage.getItem(key) } catch { /* ignore */ }
    const remoteRaw = remote[key] || null
    const merged = mergeRaw(key, localRaw, remoteRaw)
    pending.delete(key)
    if (merged === null) continue
    if (merged !== localRaw) {
      try { localStorage.setItem(key, merged); changed = true } catch { /* ignore */ }
    }
    if (merged !== remoteRaw) pending.set(key, merged)
  }
  synced = true
  void flush()
  return changed
}