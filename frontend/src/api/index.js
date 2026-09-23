import axios from 'axios'
import { readStoredToken } from '../utils/session'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// 401 后的统一处理由 auth store 注入（清理内存态 + 存储 + 跳登录页），
// 避免 api <-> store 的循环依赖，也保证清理出口只有一个
let unauthorizedHandler = null

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

// 仅当响应对应的令牌仍是当前令牌时才算当前会话失效；
// 旧令牌的迟到 401 不能清掉已经续上的新会话
function dispatchUnauthorized(error) {
  if (unauthorizedHandler) {
    unauthorizedHandler(error.config?._tokenSnapshot || null)
  }
}

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = readStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // 记录该请求携带的令牌快照，用于 401 时判断是不是"当前这一代"令牌
  config._tokenSnapshot = token
  return config
})

// 统一失效判定：服务端对"缺令牌 / 令牌过期 / 令牌非法"一律返回 401
// （历史上还曾返回过 403，这里一并兼容）。
// 超时、断网、请求取消等没有 error.response 的异常不会清理登录态，
// 原样抛给调用方处理，避免临时网络故障把用户误登出。
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const requestUrl = error.config?.url || ''
    const isAuthFailure = status === 401 || status === 403

    // 登录接口本身的 401（账号密码错误）不属于"会话失效"，
    // 且在 store.login 写入登录态之前到达，天然不会污染登录状态
    if (isAuthFailure && !requestUrl.includes('/auth/login') && unauthorizedHandler) {
      dispatchUnauthorized(error)
    }
    return Promise.reject(error)
  }
)

export default api
