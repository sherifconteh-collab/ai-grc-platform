// @tier: community
const DEFAULT_API_BASE = '/api/v1'
const LOCAL_API_BASE = 'http://localhost:3001/api/v1'

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value

  const first = value[0]
  const last = value[value.length - 1]

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }

  return value
}

export function sanitizeApiBaseUrl(rawValue?: string | null): string {
  let candidate = String(rawValue || '').trim()

  if (!candidate) {
    return DEFAULT_API_BASE
  }

  candidate = candidate.replace(/^NEXT_PUBLIC_API_URL\s*=\s*/i, '').trim()
  candidate = stripWrappingQuotes(candidate)
  candidate = candidate.replace(/^(https?):\/(?!\/)/i, '$1://')

  if (!candidate) {
    return DEFAULT_API_BASE
  }

  if (candidate.startsWith('/')) {
    if (/^\/api\/v1(?:\/|$)/i.test(candidate)) {
      return DEFAULT_API_BASE
    }

    if (/^\/api(?:\/|$)/i.test(candidate)) {
      return DEFAULT_API_BASE
    }

    return DEFAULT_API_BASE
  }

  if (!/^https?:\/\//i.test(candidate)) {
    return DEFAULT_API_BASE
  }

  try {
    const parsed = new URL(candidate)
    const pathname = parsed.pathname.replace(/\/+$/, '')

    let normalizedPath = '/api/v1'
    if (pathname === '' || pathname === '/') {
      normalizedPath = '/api/v1'
    } else if (/\/api\/v1$/i.test(pathname)) {
      normalizedPath = pathname
    } else if (/\/api$/i.test(pathname)) {
      normalizedPath = `${pathname}/v1`
    }

    return `${parsed.origin}${normalizedPath}`
  } catch {
    return DEFAULT_API_BASE
  }
}

export function getApiBaseUrl(): string {
  const normalized = sanitizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL)

  if (normalized === DEFAULT_API_BASE && process.env.NODE_ENV !== 'production') {
    return LOCAL_API_BASE
  }

  return normalized
}

export function getSocketServerUrl(apiBaseUrl: string): string {
  if (/^https?:\/\//i.test(apiBaseUrl)) {
    return apiBaseUrl.replace(/\/api\/v1\/?$/i, '')
  }

  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  return 'http://localhost:3001'
}
