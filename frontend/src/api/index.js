import axios from 'axios'
import { clearSession, getSession } from '../utils/session'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// Add the current token to authenticated requests.
api.interceptors.request.use((config) => {
  const session = getSession()
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`
  }
  return config
})

// Only an explicit invalid-token response invalidates the local session.
// Network failures, timeouts, cancellations and other HTTP errors preserve it.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isInvalidSession = error.response?.status === 401
      && !error.config?.authRequest

    if (isInvalidSession) {
      clearSession({ reason: 'unauthorized' })
    }
    return Promise.reject(error)
  }
)

export default api
