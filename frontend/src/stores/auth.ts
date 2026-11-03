import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import { clearToken, getToken, setToken } from '@/api/token'
import type { Role, User } from '@/types/api'

// Landing page for each role
const HOME_BY_ROLE: Record<Role, string> = {
  CLAIMANT: '/claims',
  APPROVER: '/approvals',
  FINANCE: '/finance',
}

// Signed-in user, shared by the whole app (setup store: plain refs and functions)
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const homePath = computed(() => (user.value ? HOME_BY_ROLE[user.value.role] : '/login'))

  // Log in: keep the token for the interceptor, the user for the UI
  async function login(email: string, password: string): Promise<void> {
    const result = await authApi.login(email, password)
    setToken(result.token)
    user.value = result.user
  }

  // Log out: the backend has no logout endpoint, dropping the token is enough
  function logout(): void {
    clearToken()
    user.value = null
  }

  // After a page refresh: rebuild the user from the stored token (false if there is none or it failed)
  async function loadMe(): Promise<boolean> {
    if (!getToken()) {
      return false
    }
    try {
      user.value = await authApi.getMe()
      return true
    } catch {
      user.value = null
      return false
    }
  }

  // UI convenience only: the backend checks roles on every request
  function hasRole(...roles: Role[]): boolean {
    if (!user.value) {
      return false
    }
    return roles.includes(user.value.role)
  }

  return { user, isAuthenticated, homePath, login, logout, loadMe, hasRole }
})
