<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowPathIcon, ExclamationCircleIcon, ReceiptPercentIcon } from '@heroicons/vue/24/outline'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// Form state
const email = ref('')
const password = ref('')
const submitting = ref(false)
const slowServer = ref(false)
const errorMessage = ref('')

// Seeded demo accounts (passwords are never shown)
const demoAccounts = [
  { email: 'asha.claimant@example.com', label: 'Asha · Claimant' },
  { email: 'ravi.l1@example.com', label: 'Ravi · Approver L1' },
  { email: 'meera.l2@example.com', label: 'Meera · Approver L2' },
  { email: 'farah.finance@example.com', label: 'Farah · Finance' },
]

// Only same-site paths are allowed as a redirect target (blocks open redirects like "//evil.com")
function safeRedirect(): string | null {
  const target = route.query.redirect
  if (typeof target !== 'string') {
    return null
  }
  const isLocalPath = target.startsWith('/') && !target.startsWith('//')
  return isLocalPath ? target : null
}

// Show a hint if the free-tier backend is waking up
let slowTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(slowTimer))

// Submit: log in, then go to the requested page or the role's home
async function onSubmit(): Promise<void> {
  errorMessage.value = ''
  submitting.value = true
  slowTimer = setTimeout(() => (slowServer.value = true), 5000)

  try {
    await auth.login(email.value, password.value)
    const target = safeRedirect() ?? auth.homePath
    await router.replace(target)
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
  } finally {
    clearTimeout(slowTimer)
    submitting.value = false
    slowServer.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
    <div class="w-full max-w-md">
      <!-- Brand -->
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"
        >
          <ReceiptPercentIcon class="size-7" />
        </div>
        <h1 class="text-2xl font-semibold text-slate-900">Expense Claims</h1>
        <p class="mt-1 text-sm text-slate-500">Sign in to submit and review claims</p>
      </div>

      <!-- Login form -->
      <form
        class="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8"
        @submit.prevent="onSubmit"
      >
        <div
          v-if="errorMessage"
          class="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          <ExclamationCircleIcon class="size-5 shrink-0" />
          <span>{{ errorMessage }}</span>
        </div>

        <div>
          <label for="email" class="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          :disabled="submitting"
          class="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowPathIcon v-if="submitting" class="size-4 animate-spin" />
          {{ submitting ? 'Signing in…' : 'Sign in' }}
        </button>

        <p v-if="slowServer" class="text-center text-xs text-slate-500">
          The server is waking up, this can take up to a minute.
        </p>
      </form>

      <!-- Demo accounts: click to fill the email -->
      <div class="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p class="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Demo accounts</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="account in demoAccounts"
            :key="account.email"
            type="button"
            class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
            @click="email = account.email"
          >
            {{ account.label }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
