import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'
import {
  clearSession,
  getSession,
  setSession,
  subscribeSession
} from '../utils/session'

export const useAuthStore = defineStore('auth', () => {
  const session = getSession()
  const token = ref(session?.token || '')
  const username = ref(session?.username || '')

  const isLoggedIn = computed(() => token.value !== '' && getSession() !== null)

  let loginAttempt = 0
  let loginController = null

  subscribeSession((event) => {
    if (event.type === 'set') {
      token.value = event.session.token
      username.value = event.session.username
    } else {
      token.value = ''
      username.value = ''
    }
  })

  async function login(user, password) {
    const attempt = ++loginAttempt
    loginController?.abort()

    const controller = new AbortController()
    loginController = controller

    try {
      const response = await api.post(
        '/auth/login',
        {
          username: user,
          password: password
        },
        {
          signal: controller.signal,
          authRequest: true
        }
      )

      if (attempt !== loginAttempt) {
        const error = new Error('Login superseded')
        error.code = 'LOGIN_SUPERSEDED'
        throw error
      }

      const nextSession = setSession(response.data.token, response.data.username)
      loginController = null
      return { token: nextSession.token, username: nextSession.username }
    } catch (error) {
      if (attempt === loginAttempt) {
        loginController = null
      }
      throw error
    }
  }

  function logout() {
    loginAttempt += 1
    loginController?.abort()
    loginController = null
    clearSession({ reason: 'manual' })
  }

  return {
    token,
    username,
    isLoggedIn,
    login,
    logout
  }
})
