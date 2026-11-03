<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRightStartOnRectangleIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  InboxStackIcon,
  ReceiptPercentIcon,
  TableCellsIcon,
} from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/api'

const auth = useAuthStore()
const router = useRouter()

type NavLink = { to: string; label: string; icon: Component }

// Navigation per role (hiding links is convenience; the backend enforces access)
const NAV_BY_ROLE: Record<Role, NavLink[]> = {
  CLAIMANT: [{ to: '/claims', label: 'My claims', icon: DocumentTextIcon }],
  APPROVER: [
    { to: '/approvals', label: 'Approval queue', icon: InboxStackIcon },
    { to: '/reviewed', label: 'Reviewed', icon: ClipboardDocumentCheckIcon },
  ],
  FINANCE: [{ to: '/finance', label: 'Approved claims', icon: TableCellsIcon }],
}

const navLinks = computed(() => (auth.user ? NAV_BY_ROLE[auth.user.role] : []))

// Readable role label, e.g. "Approver · L2"
const roleLabel = computed(() => {
  const user = auth.user
  if (!user) {
    return ''
  }
  const role = user.role.charAt(0) + user.role.slice(1).toLowerCase()
  return user.approvalLevel ? `${role} · L${user.approvalLevel}` : role
})

// Log out and go back to the login page
async function onLogout(): Promise<void> {
  auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Top bar -->
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <RouterLink
          :to="auth.homePath"
          class="flex items-center gap-2 font-semibold text-slate-900"
        >
          <span class="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <ReceiptPercentIcon class="size-5" />
          </span>
          <span class="hidden sm:inline">Expense Claims</span>
        </RouterLink>

        <!-- Role-based links -->
        <nav class="flex items-center gap-1">
          <RouterLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            active-class="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <component :is="link.icon" class="size-4" />
            {{ link.label }}
          </RouterLink>
        </nav>

        <!-- Current user and logout -->
        <div v-if="auth.user" class="ml-auto flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <p class="text-sm font-medium text-slate-900">{{ auth.user.name }}</p>
            <p class="text-xs text-slate-500">{{ roleLabel }}</p>
          </div>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            @click="onLogout"
          >
            <ArrowRightStartOnRectangleIcon class="size-4" />
            <span class="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Page content -->
    <main class="mx-auto max-w-6xl px-4 py-8">
      <RouterView />
    </main>
  </div>
</template>
