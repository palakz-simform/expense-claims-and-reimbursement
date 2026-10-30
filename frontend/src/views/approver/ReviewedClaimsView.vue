<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import { listClaims } from '@/api/claims'
import EmptyState from '@/components/EmptyState.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import type { ClaimStatus, ClaimSummary, Paginated } from '@/types/api'
import { formatDateTime, formatMoney } from '@/utils/format'

// Every claim that reached this approver (GET /claims is scoped by the backend to claims with one of my steps).
// The status is the claim's, not my own decision: the detail page's approval chain shows who decided what.
const route = useRoute()
const router = useRouter()

// Status tabs (no Drafts: a draft never reaches an approver)
const STATUS_TABS: { value: ClaimStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'PENDING_APPROVAL', label: 'In progress' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]
const VALID_STATUSES: string[] = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED']

// Filters live in the URL (?status=&page=), so refresh, back and shared links keep them
const status = computed<ClaimStatus | 'all'>(() => {
  const value = route.query.status
  const isValid = typeof value === 'string' && VALID_STATUSES.includes(value)
  return isValid ? (value as ClaimStatus) : 'all'
})
const page = computed({
  get: () => {
    const value = Number(route.query.page)
    return Number.isInteger(value) && value > 0 ? value : 1
  },
  set: (value: number) => {
    void router.replace({ query: { ...route.query, page: String(value) } })
  },
})

function selectStatus(value: ClaimStatus | 'all'): void {
  const query = value === 'all' ? {} : { status: value }
  void router.replace({ query })
}

// List state
const result = ref<Paginated<ClaimSummary> | null>(null)
const loading = ref(false)
const loadError = ref<unknown>(null)

// Only the newest request may update the list (a slow older response must not overwrite it)
let latestRequestId = 0

async function loadClaims(): Promise<void> {
  latestRequestId++
  const requestId = latestRequestId
  loading.value = true
  loadError.value = null

  try {
    const filterStatus = status.value === 'all' ? undefined : status.value
    const data = await listClaims({ page: page.value, status: filterStatus })
    if (requestId === latestRequestId) {
      result.value = data
    }
  } catch (error) {
    if (requestId === latestRequestId) {
      loadError.value = error
    }
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
    }
  }
}

// Reload whenever the filters in the URL change (and once on first load)
watch(() => [status.value, page.value], loadClaims, { immediate: true })
</script>

<template>
  <PageHeader
    title="Reviewed claims"
    description="Every claim that reached you. Open one to see each level's decision."
  />

  <!-- Status filter tabs -->
  <div class="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
    <button
      v-for="tab in STATUS_TABS"
      :key="tab.value"
      type="button"
      :class="
        status === tab.value
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900'
      "
      class="rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap"
      @click="selectStatus(tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>

  <ErrorAlert :error="loadError" class="mb-4" />

  <!-- Loading skeleton on the first load -->
  <div v-if="loading && !result" class="space-y-2">
    <div v-for="row in 4" :key="row" class="h-16 animate-pulse rounded-xl bg-slate-200/60" />
  </div>

  <div v-else-if="result" class="relative">
    <!-- Spinner over the current rows while a tab or page change reloads them -->
    <div
      v-if="loading"
      class="absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-white/50 pt-16"
      aria-live="polite"
    >
      <span
        class="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-md ring-1 ring-slate-200"
      >
        <ArrowPathIcon class="size-4 animate-spin text-indigo-600" /> Loading…
      </span>
    </div>

    <EmptyState
      v-if="result.data.length === 0"
      title="No claims here"
      :description="
        status === 'all' ? 'No claim has reached you yet.' : 'No claims with this status.'
      "
    />

    <!-- Claims list: every row opens the read-only detail page -->
    <ul
      v-else
      class="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <li v-for="claim in result.data" :key="claim.id">
        <RouterLink
          :to="`/claims/${claim.id}`"
          class="flex flex-col gap-2 px-4 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-6 sm:px-6"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-slate-400">#{{ claim.claimNumber }}</span>
              <StatusBadge :status="claim.status" />
            </div>
            <p class="mt-1 truncate font-medium text-slate-900">{{ claim.title }}</p>
            <p class="text-xs text-slate-500">
              {{ claim.lineItemCount }} {{ claim.lineItemCount === 1 ? 'item' : 'items' }} ·
              Submitted {{ formatDateTime(claim.submittedAt) }}
            </p>
          </div>
          <p class="text-lg font-semibold text-slate-900 sm:text-right">
            {{ formatMoney(claim.total) }}
          </p>
        </RouterLink>
      </li>
    </ul>

    <PaginationBar
      v-model:page="page"
      :total-pages="result.pagination.totalPages"
      :total-items="result.pagination.totalItems"
    />
  </div>
</template>
