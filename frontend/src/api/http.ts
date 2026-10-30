import axios from 'axios'
import { ApiError } from './errors'
import { clearToken, getToken } from './token'

// Base URL: fail fast if missing
const baseURL = import.meta.env.VITE_API_URL
if (!baseURL) {
  throw new Error('VITE_API_URL is not set. Copy frontend/.env.example to frontend/.env')
}

// Shared axios instance (60s timeout covers the Render cold start)
export const http = axios.create({ baseURL, timeout: 60000 })

// Attach the JWT to every request
http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// 401 handler set by main.ts (avoids importing the router here)
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

// Backend error body shape
type ErrorBody = {
  error?: { code?: string; message?: string; details?: unknown; requestId?: string }
}

// Turn every failure into an ApiError
http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // Not from axios: pass through
    if (!axios.isAxiosError<ErrorBody>(error)) {
      return Promise.reject(error)
    }

    // No response: server down, CORS or timeout
    if (!error.response) {
      const networkError = new ApiError(
        0,
        'NETWORK_ERROR',
        'Cannot reach the server. Please try again.',
      )
      return Promise.reject(networkError)
    }

    // Server error: copy its code and message
    const status = error.response.status
    const body = error.response.data?.error
    const code = body?.code ?? 'UNKNOWN_ERROR'
    const message = body?.message ?? error.message
    const apiError = new ApiError(status, code, message, body?.requestId, body?.details)

    // Session expired: log out (except on login, where 401 means wrong password)
    const isLoginRequest = error.config?.url === '/auth/login'
    if (status === 401 && !isLoginRequest) {
      clearToken()
      onUnauthorized?.()
    }

    return Promise.reject(apiError)
  },
)
