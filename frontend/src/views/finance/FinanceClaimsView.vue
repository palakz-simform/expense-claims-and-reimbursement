<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDownTrayIcon, ArrowPathIcon, CheckCircleIcon } from '@heroicons/vue/24/outline'
import { listClaims } from '@/api/claims'
import { fieldErrorsOf } from '@/api/errors'
import { exportApprovedClaims, exportFileName } from '@/api/finance'
import BaseButton from '@/components/BaseButton.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import type { ClaimStatus, ClaimSummary, Paginated } from '@/types/api'
import { saveBlob } from '@/utils/download'
import { formatDateTime, formatMoney, monthStartIsoDate, todayIsoDate } from '@/utils/format'

const route = useRoute()
const router = useRouter()

const inputClass =
  'block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none'

// ===== CSV export (period = final approval date) =====
const exportFrom = ref(monthStartIsoDate())
const exportTo = ref(todayIsoDate())
const exporting = ref(false)
const exportError = ref<unknown>(null)
const exportNotice = ref<string | null>(null)

// A from/to validation message shows under its input; anything else in the banner
const exportFieldErrors = computed(() => fieldErrorsOf(exportError.value))
const exportBanner = computed(() => {
  const hasFieldErrors = Object.keys(exportFieldErrors.value).length > 0
  return hasFieldErrors ? null : exportError.value
})

async function onExport(): Promise<void> {
  exporting.value = true
  exportError.value = null
  exportNotice.value = null
  try {
    const blob = await exportApprovedClaims(exportFrom.value, exportTo.value)
    const fileName = exportFileName(exportFrom.value, exportTo.value)
    saveBlob(blob, fileName)
    exportNotice.value = `Downloaded ${fileName}`
  } catch (error) {
    exportError.value = error
  } finally {
    exporting.value = false
  }
}

// ===== Claims table (filters live in the URL: ?status=&from=&to=&page=) =====
// Approved first: that is what finance works with; "all" shows every status
type StatusFilter = ClaimStatus | 'all'
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PENDING_APPROVAL', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'all', label: 'All' },
]
const VALID_TABS: string[] = ['APPROVED', 'PENDING_APPROVAL', 'REJECTED', 'all']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const status = computed<StatusFilter>(() => {
  const value = route.query.status
  const isValid = typeof value === 'string' && VALID_TABS.includes(value)
  return isValid ? (value as StatusFilter) : 'APPROVED'
})

// A date from the URL, or undefined if missing or malformed (the backend would reject it anyway)
function queryDate(key: 'from' | 'to'): string | undefined {
  const value = route.query[key]
  const isValid = typeof value === 'string' && ISO_DATE.test(value)
  return isValid ? value : undefined
}
const submittedFrom = computed(() => queryDate('from'))
const submittedTo = computed(() => queryDate('to'))

const page = computed({
  get: () => {
    const value = Number(route.query.page)
    return Number.isInteger(value) && value > 0 ? value : 1
  },
  set: (value: number) => {
    void router.replace({ query: { ...route.query, page: String(value) } })
  },
})

// Changing a filter starts again at page 1 (undefined keys are left out of the URL)
function selectStatus(value: StatusFilter): void {
  const query = { ...route.query, status: value, page: undefined }
  void router.replace({ query })
}

// The date inputs are edited locally and only applied on "Apply"
const fromDraft = ref(submittedFrom.value ?? '')
const toDraft = ref(submittedTo.value ?? '')

function applyDates(): void {
  const query = {
    ...route.query,
    from: fromDraft.value || undefined,
    to: toDraft.value || undefined,
    page: undefined,
  }
  void router.replace({ query })
}

function clearDates(): void {
  fromDraft.value = ''
  toDraft.value = ''
  applyDates()
}

// List state
const result = ref<Paginated<ClaimSummary> | null>(null)
const loading = ref(false)
const loadError = ref<unknown>(null)

// Only the newest request may update the table (a slow older response must not overwrite it)
let latestRequestId = 0

async function loadClaims(): Promise<void> {
  latestRequestId++
  const requestId = latestRequestId
  loading.value = true
  loadError.value = null

  try {
    const filterStatus = status.value === 'all' ? undefined : status.value
    const query = {
      page: page.value,
      status: filterStatus,
      from: submittedFrom.value,
      to: submittedTo.value,
    }
    const data = await listClaims(query)
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

// Reload whenever a filter in the URL changes (and once on first load)
watch(() => [status.value, submittedFrom.value, submittedTo.value, page.value], loadClaims, {
  immediate: true,
})
</script>

<template>
  <PageHeader title="Approved claims" description="Review claims and export a period for payout." />

  <!-- CSV export -->
  <section class="mb-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
    <h2 class="font-semibold text-slate-900">Export approved claims</h2>
    <p class="mt-1 text-sm text-slate-500">
      Claims fully approved between these dates (inclusive, UTC), one CSV row per claim.
    </p>

    <form class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="onExport">
      <div class="sm:w-44">
        <label for="export-from" class="mb-1 block text-xs font-medium text-slate-600">
          Approved from
        </label>
        <input
          id="export-from"
          v-model="exportFrom"
          type="date"
          required
          :max="exportTo || undefined"
          :class="inputClass"
        />
        <p v-if="exportFieldErrors.from" class="mt-1 text-xs text-red-600">
          {{ exportFieldErrors.from }}
        </p>
      </div>
      <div class="sm:w-44">
        <label for="export-to" class="mb-1 block text-xs font-medium text-slate-600">
          Approved to
        </label>
        <input
          id="export-to"
          v-model="exportTo"
          type="date"
          required
          :min="exportFrom || undefined"
          :class="inputClass"
        />
        <p v-if="exportFieldErrors.to" class="mt-1 text-xs text-red-600">
          {{ exportFieldErrors.to }}
        </p>
      </div>
      <BaseButton type="submit" :loading="exporting" class="sm:mt-5">
        <ArrowDownTrayIcon class="size-4" /> Download CSV
      </BaseButton>
    </form>

    <ErrorAlert :error="exportBanner" class="mt-4" />
    <p
      v-if="exportNotice"
      class="mt-4 flex items-center gap-2 text-sm text-green-700"
      role="status"
    >
      <CheckCircleIcon class="size-5" /> {{ exportNotice }}
    </p>
  </section>

  <!-- Filters: status tabs and the submitted-date range -->
  <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
    <div class="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
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

    <form class="flex flex-wrap items-end gap-2" @submit.prevent="applyDates">
      <div>
        <label for="submitted-from" class="mb-1 block text-xs font-medium text-slate-600">
          Submitted from
        </label>
        <input id="submitted-from" v-model="fromDraft" type="date" :class="inputClass" />
      </div>
      <div>
        <label for="submitted-to" class="mb-1 block text-xs font-medium text-slate-600">
          Submitted to
        </label>
        <input
          id="submitted-to"
          v-model="toDraft"
          type="date"
          :min="fromDraft || undefined"
          :class="inputClass"
        />
      </div>
      <BaseButton type="submit" variant="secondary">Apply</BaseButton>
      <BaseButton v-if="submittedFrom || submittedTo" variant="ghost" @click="clearDates">
        Clear
      </BaseButton>
    </form>
  </div>

  <ErrorAlert :error="loadError" class="mb-4" />

  <!-- Loading skeleton on the first load -->
  <div v-if="loading && !result" class="space-y-2">
    <div v-for="row in 5" :key="row" class="h-12 animate-pulse rounded-xl bg-slate-200/60" />
  </div>

  <div v-else-if="result" class="relative">
    <!-- Spinner over the current rows while a filter or page change reloads them -->
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
      title="No claims found"
      description="Try another status or date range."
    />

    <!-- Claims table (scrolls sideways on small screens) -->
    <div v-else class="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <table class="min-w-full divide-y divide-slate-100 text-sm">
        <thead
          class="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase"
        >
          <tr>
            <th scope="col" class="px-4 py-3">Claim</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3">Items</th>
            <th scope="col" class="px-4 py-3">Submitted</th>
            <th scope="col" class="px-4 py-3">Approved</th>
            <th scope="col" class="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="claim in result.data" :key="claim.id" class="hover:bg-slate-50">
            <td class="max-w-xs px-4 py-3">
              <RouterLink :to="`/claims/${claim.id}`" class="group block">
                <span class="text-xs text-slate-400">#{{ claim.claimNumber }}</span>
                <span class="block truncate font-medium text-slate-900 group-hover:text-indigo-600">
                  {{ claim.title }}
                </span>
              </RouterLink>
            </td>
            <td class="px-4 py-3"><StatusBadge :status="claim.status" /></td>
            <td class="px-4 py-3 text-slate-600">{{ claim.lineItemCount }}</td>
            <td class="px-4 py-3 whitespace-nowrap text-slate-600">
              {{ formatDateTime(claim.submittedAt) }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-slate-600">
              {{ formatDateTime(claim.approvedAt) }}
            </td>
            <td class="px-4 py-3 text-right font-semibold whitespace-nowrap text-slate-900">
              {{ formatMoney(claim.total) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar
      v-model:page="page"
      :total-pages="result.pagination.totalPages"
      :total-items="result.pagination.totalItems"
    />
  </div>
</template>
