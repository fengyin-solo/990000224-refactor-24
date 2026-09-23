// 会话存储与失效判定的唯一口径：
// 路由守卫、请求拦截器、auth store、多标签页同步都从这里取判定结果，
// 避免"超时 / 服务端拒绝 / 重开页面 / 他页退出"各自做出不同结论。

export const TOKEN_KEY = 'blog_token'
export const USERNAME_KEY = 'blog_username'

// 容忍客户端与服务端之间少量时钟偏差，避免临界时间误判
const CLOCK_SKEW_MS = 10 * 1000

export function readStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function readStoredUsername() {
  return localStorage.getItem(USERNAME_KEY) || ''
}

// 仅解析 JWT 的 exp 声明；无法解析时返回 null（交给服务端裁决，不在这里误杀）
export function getTokenExpiry(token) {
  if (!token || token.split('.').length !== 3) return null
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    )
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

// 唯一的"是否仍登录"判定：无令牌或已过期都算未登录；
// 解析不出 exp 的令牌按可用处理，最终以服务端 401 为准
export function isTokenUsable(token, now = Date.now()) {
  if (!token) return false
  const exp = getTokenExpiry(token)
  if (exp === null) return true
  return exp - CLOCK_SKEW_MS > now
}

// 登录态写入也是同一个出口，保证内存态与持久化原子一致
export function persistStoredSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USERNAME_KEY, username || '')
}

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
}

// 页面初始化（含重新打开标签页）时收拢判定：
// 已过期令牌直接清掉，让守卫与拦截器看到的始终是同一份干净状态
export function loadInitialSession() {
  const token = readStoredToken()
  if (token && !isTokenUsable(token)) {
    clearStoredSession()
    return { token: '', username: '' }
  }
  return { token, username: readStoredUsername() }
}
