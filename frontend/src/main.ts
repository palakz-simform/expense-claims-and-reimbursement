import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Global styles (Tailwind) load once, before any component
import './assets/main.css'

import App from './App.vue'
import router from './router'

// Create the app and register the plugins: Pinia (shared state) and the router (pages by URL)
const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
