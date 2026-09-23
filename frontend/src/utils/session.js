export const TOKEN_KEY = 'blog_token'
export const USERNAME_KEY = 'blog_username'

const listeners = new Set()
const MAX_TIMER_DELAY = 2 ** 31 - 1

let activeSession = readStoredSession()
let expiryTimer = null
let storageSyncScheduled = false

if (activeSession) {
  scheduleExpiry(activeSession.expiresAt)
} else {
  removeStoredSession()
}

function decodeToken(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = decodeURIComponent(
      Array.from(window.atob(padded), (char) => (
        `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
      )).join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

function normalizeSession(token, username) {
  if (typeof token !== 'string' || token.trim() === '') {
    return null
  }

  const payload = decodeToken(token)
  const expiresAt = Number.isFinite(payload?.exp)
    ? payload.exp * 1000
    : Number.NaN

  if (!payload || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null
  }

  const normalizedUsername = typeof username === 'string' && username.trim() !== ''
    ? username
    : payload.username

  if (typeof normalizedUsername !== 'string' || normalizedUsername.trim() === '') {
    return null
  }

  return {
    token,
    username: normalizedUsername,
    expiresAt
  }
}

function readStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null
  return normalizeSession(token, localStorage.getItem(USERNAME_KEY))
}

function removeStoredSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
}

function clearExpiryTimer() {
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer)
    expiryTimer = null
  }
}

function scheduleExpiry(expiresAt) {
  clearExpiryTimer()

  const schedule = () => {
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) {
      clearSession({ reason: 'expired' })
      return
    }

    expiryTimer = setTimeout(() => {
      expiryTimer = null
      if (expiresAt - Date.now() > MAX_TIMER_DELAY) {
        schedule()
      } else if (expiresAt <= Date.now()) {
        clearSession({ reason: 'expired' })
      } else {
        schedule()
      }
    }, Math.min(remaining, MAX_TIMER_DELAY))
  }

  schedule()
}

function emit(event) {
  listeners.forEach((listener) => listener(event))
}

function reconcileFromStorage() {
  const session = readStoredSession()

  if (session) {
    const changed = !activeSession
      || activeSession.token !== session.token
      || activeSession.username !== session.username
      || activeSession.expiresAt !== session.expiresAt

    if (!changed) return

    activeSession = session
    scheduleExpiry(session.expiresAt)
    emit({ type: 'set', session, reason: 'storage' })
    return
  }

  const hadSession = activeSession !== null
    || localStorage.getItem(TOKEN_KEY) !== null
    || localStorage.getItem(USERNAME_KEY) !== null

  activeSession = null
  clearExpiryTimer()
  removeStoredSession()

  if (hadSession) {
    emit({ type: 'clear', reason: 'storage' })
  }
}

function scheduleStorageSync() {
  if (storageSyncScheduled) return
  storageSyncScheduled = true
  queueMicrotask(() => {
    storageSyncScheduled = false
    reconcileFromStorage()
  })
}

window.addEventListener('storage', (event) => {
  if (event.key && event.key !== TOKEN_KEY && event.key !== USERNAME_KEY) {
    return
  }
  scheduleStorageSync()
})

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    scheduleStorageSync()
  }
})

export function getSession() {
  if (!activeSession || activeSession.expiresAt <= Date.now()) {
    return null
  }
  return activeSession
}

export function setSession(token, username) {
  const session = normalizeSession(token, username)
  if (!session) {
    throw new Error('Invalid or expired session token')
  }

  // The token is the commit point; its payload supplies the username fallback.
  localStorage.setItem(TOKEN_KEY, session.token)
  localStorage.setItem(USERNAME_KEY, session.username)

  activeSession = session
  scheduleExpiry(session.expiresAt)
  emit({ type: 'set', session, reason: 'login' })
  return session
}

export function clearSession({ reason = 'invalid' } = {}) {
  const hadSession = activeSession !== null
    || localStorage.getItem(TOKEN_KEY) !== null
    || localStorage.getItem(USERNAME_KEY) !== null

  activeSession = null
  clearExpiryTimer()
  removeStoredSession()

  if (hadSession) {
    emit({ type: 'clear', reason })
  }
}

export function subscribeSession(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
