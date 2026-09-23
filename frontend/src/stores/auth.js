import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { setUnauthorizedHandler } from '../api'
import router from '../router'
import { ElMessage } from 'element-plus'
import {
  TOKEN_KEY,
  loadInitialSession,
  isTokenUsable,
  persistStoredSession,
  clearStoredSession,
  readStoredToken,
  readStoredUsername
} from '../utils/session'

const initial = loadInitialSession()

export const useAuthStore = defineStore('auth', () => {
  const token = ref(initial.token)
  const username = ref(initial.username)

  const isLoggedIn = computed(() => isTokenUsable(token.value))

  // 清理登录态的唯一出口：内存态与 localStorage 同步清空，
  // logout（主动退出）与 handleSessionEnded（被动失效）都汇聚到这里
  function clearSession() {
    token.value = ''
    username.value = ''
    clearStoredSession()
  }

  // 被动失效（401、其他标签页退出、守卫兜底）的统一结果：
  // 清态 + 回到登录页。幂等：已在登录页或已清理过时不重复跳转、不重复提示
  function handleSessionEnded(message = '登录已过期，请重新登录') {
    const wasLoggedIn = isTokenUsable(token.value)
    clearSession()
    if (router.currentRoute.value.meta.requiresAuth) {
      router.replace({
        name: 'Login',
        query: { redirect: router.currentRoute.value.fullPath }
      })
    }
    if (wasLoggedIn) {
      ElMessage.warning(message)
    }
  }

  // 让拦截器的 401 走到统一出口；仅当被拒令牌就是当前令牌时才失效，
  // 旧请求的迟到 401 不得影响已续上的新会话（无令牌请求被拒时会话本就为空，
  // 走同一出口也是空操作，不会产生提示或跳转）
  setUnauthorizedHandler((rejectedToken) => {
    if (rejectedToken !== token.value) return
    handleSessionEnded()
  })

  // 登录代际：重复点击、竞态续期等情况下，只有最新一次登录能写入登录态；
  // 在途的旧登录若在退出之后才返回，也无法把登录态写回来
  let loginGeneration = 0
  let pendingLogin = null

  async function login(user, password) {
    // 同一时刻的并发登录复用同一个请求，结果一致，不会互相覆盖
    if (pendingLogin) return pendingLogin

    const generation = ++loginGeneration
    pendingLogin = api.post('/auth/login', {
      username: user,
      password: password
    })

    try {
      const response = await pendingLogin
      // 失败（超时 / 断网 / 取消 / 401）走 catch，永远不会写入登录态；
      // 成功也要确认这仍是最新一次登录，期间发生过退出/再次登录则丢弃
      if (generation === loginGeneration) {
        token.value = response.data.token
        username.value = response.data.username
        persistStoredSession(token.value, username.value)
      }
      return response.data
    } finally {
      pendingLogin = null
    }
  }

  function logout() {
    // 使一切在途登录的返回失效，防止"先退出、响应后到、又登录回来"
    loginGeneration++
    clearSession()
  }

  // 多标签页同步：另一个标签页的登录/退出通过 storage 事件收敛到同一状态
  window.addEventListener('storage', (event) => {
    if (event.key !== TOKEN_KEY) return

    const nextToken = readStoredToken()
    if (!isTokenUsable(nextToken)) {
      // 他页退出或写入了过期令牌：本页同样失效并回登录页
      if (isTokenUsable(token.value)) {
        handleSessionEnded('登录状态已在其他页面退出')
      } else {
        clearSession()
      }
    } else {
      // 他页登录：直接采用，不打断当前所在页面
      token.value = nextToken
      username.value = readStoredUsername()
    }
  })

  return {
    token,
    username,
    isLoggedIn,
    login,
    logout,
    clearSession,
    handleSessionEnded
  }
})
