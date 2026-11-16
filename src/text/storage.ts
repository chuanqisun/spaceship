/** localStorage that may be unavailable (private mode, blocked site data): every access is best-effort. */
export function stored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export function storeJson(key: string, value: unknown) {
  store(key, JSON.stringify(value))
}

export function storedJson<T>(key: string): T | undefined {
  const raw = stored(key)
  if (raw === null) return
  try {
    return JSON.parse(raw) as T
  } catch {
    return
  }
}
