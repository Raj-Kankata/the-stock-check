/**
 * stockcheck-search-log — Cloudflare Worker + D1.
 *
 * Receives anonymous search events from thestockcheck.com and stores ONLY
 * what the site sends: a UTC timestamp, the search query, and the ticker
 * picked (or null for a no-result search). No IP, no user agent, no
 * headers, no cookies — nothing that can identify a visitor is ever read
 * or stored. /stats returns aggregates only, behind a bearer token; no
 * raw rows ever leave the database.
 *
 * Types are declared inline (no @cloudflare/workers-types dependency) so
 * this file type-checks under the repo's root tsconfig too.
 */

const ALLOWED_ORIGIN = 'https://www.thestockcheck.com'
const WINDOW_DAYS = 30

// Query: ticker-prefix searches — uppercase letters, digits, space, dot, dash.
const QUERY_RE = /^[A-Z0-9 .\-]{1,20}$/
// Ticker: 1–12 chars, letters/digits/dot/dash (BRK.B, UHAL-B, ...).
const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

interface D1AllResult<T> {
  results: T[]
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<{ success: boolean }>
  all<T>(): Promise<D1AllResult<T>>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
}

interface Env {
  DB: D1Database
  STATS_TOKEN: string
}

interface CountRow {
  key: string
  n: number
}

interface DayRow {
  d: string
  n: number
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

async function handleLog(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON' }, 400)
  }
  if (body === null || typeof body !== 'object') {
    return json({ error: 'invalid body' }, 400)
  }
  const { query, ticker } = body as { query?: unknown; ticker?: unknown }
  if (typeof query !== 'string') {
    return json({ error: 'query must be a string' }, 400)
  }
  const q = query.trim().toUpperCase()
  if (!QUERY_RE.test(q)) {
    return json({ error: 'invalid query' }, 400)
  }
  let t: string | null = null
  if (ticker !== null && ticker !== undefined) {
    if (typeof ticker !== 'string') {
      return json({ error: 'ticker must be a string or null' }, 400)
    }
    const tt = ticker.trim().toUpperCase()
    if (!TICKER_RE.test(tt)) {
      return json({ error: 'invalid ticker' }, 400)
    }
    t = tt
  }
  const ts = new Date().toISOString()
  await env.DB.prepare(
    'INSERT INTO search_log (ts, query, ticker, picked) VALUES (?1, ?2, ?3, ?4)',
  )
    .bind(ts, q, t, t === null ? 0 : 1)
    .run()
  return json({ ok: true })
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? ''
  if (env.STATS_TOKEN === '' || auth !== `Bearer ${env.STATS_TOKEN}`) {
    return json({ error: 'unauthorized' }, 401)
  }
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const topQueries = await env.DB.prepare(
    'SELECT query AS key, COUNT(*) AS n FROM search_log WHERE ts >= ?1 GROUP BY query ORDER BY n DESC LIMIT 20',
  )
    .bind(since)
    .all<CountRow>()
  const topPicked = await env.DB.prepare(
    'SELECT ticker AS key, COUNT(*) AS n FROM search_log WHERE ts >= ?1 AND picked = 1 GROUP BY ticker ORDER BY n DESC LIMIT 20',
  )
    .bind(since)
    .all<CountRow>()
  const topNoResult = await env.DB.prepare(
    'SELECT query AS key, COUNT(*) AS n FROM search_log WHERE ts >= ?1 AND picked = 0 GROUP BY query ORDER BY n DESC LIMIT 20',
  )
    .bind(since)
    .all<CountRow>()
  const daily = await env.DB.prepare(
    'SELECT substr(ts, 1, 10) AS d, COUNT(*) AS n FROM search_log WHERE ts >= ?1 GROUP BY d ORDER BY d',
  )
    .bind(since)
    .all<DayRow>()
  return json({
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    top_queries: topQueries.results,
    top_picked_tickers: topPicked.results,
    top_no_result_queries: topNoResult.results,
    daily_counts: daily.results,
  })
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    // Browsers on any other origin are refused outright; server-side
    // calls (curl, no Origin header) are allowed.
    if (origin !== null && origin !== ALLOWED_ORIGIN) {
      return json({ error: 'origin not allowed' }, 403)
    }
    const cors = corsHeaders()
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (url.pathname === '/log' && request.method === 'POST') {
      const res = await handleLog(request, env)
      const headers = new Headers(res.headers)
      for (const [k, v] of Object.entries(cors)) headers.set(k, v)
      return new Response(res.body, { status: res.status, headers })
    }
    if (url.pathname === '/stats' && request.method === 'GET') {
      return handleStats(request, env)
    }
    return json({ error: 'not found' }, 404)
  },
}

export default worker
