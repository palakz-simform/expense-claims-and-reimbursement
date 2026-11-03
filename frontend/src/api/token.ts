// Where the JWT is kept. sessionStorage survives a page refresh but is cleared when the tab closes,
// which keeps a leaked token usable for less time than localStorage would.
// Storage can throw (private mode, blocked site data), so every call is guarded.
const TOKEN_KEY = 'auth_token'

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Not stored: the user stays logged in until the page is refreshed
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to clear
  }
}
