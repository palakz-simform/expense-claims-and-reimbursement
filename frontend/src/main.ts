import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Global styles (Tailwind) load once, before any component
import './assets/main.css'

import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './api/http'
import { useAuthStore } from './stores/auth'

// Create the app and register the plugins: Pinia (shared state) and the router (pages by URL)
const app = createApp(App)

app.use(createPinia())
app.use(router)

// Session expired mid-use (any 401): sign out and go to login, then come back to the same page.
// Skipped while nobody is signed in: the route guard already handles that case.
setUnauthorizedHandler(() => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    return
  }
  auth.logout()
  const currentPath = router.currentRoute.value.fullPath
  void router.push({ name: 'login', query: { redirect: currentPath, expired: '1' } })
})

app.mount('#app')
