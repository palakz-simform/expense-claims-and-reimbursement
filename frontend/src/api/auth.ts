import { http } from './http'
import type { LoginResponse, User } from '@/types/api'

// POST /auth/login: returns the JWT and the user
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await http.post<LoginResponse>('/auth/login', { email, password })
  return response.data
}

// GET /auth/me: the user behind the current token
export async function getMe(): Promise<User> {
  const response = await http.get<{ user: User }>('/auth/me')
  return response.data.user
}
