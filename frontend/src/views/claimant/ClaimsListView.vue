<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowPathIcon, PlusIcon } from '@heroicons/vue/24/outline'
import { createClaim, listClaims } from '@/api/claims'
import BaseButton from '@/components/BaseButton.vue'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import type { ClaimStatus, ClaimSummary, Paginated } from '@/types/api'
import { formatDateTime, formatMoney } from '@/utils/format'

const route = useRoute()
const router = useRouter()

// Status filter tabs ("all" = no filter)
const STATUS_TABS: { value: ClaimStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PENDING_APPROVAL', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'APPROVED', label: 'Approved' },
]
const VALID_STATUSES: string[] = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'APPROVED']

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

// Claimants open a claim in the editor unless it is approved (then it is read-only)
function claimLink(claim: ClaimSummary): string {
  return claim.status === 'APPROVED' ? `/claims/${claim.id}` : `/claims/${claim.id}/edit`
}

// New claim dialog: create a draft with a title, then open it in the editor
const newClaimOpen = ref(false)
const newTitle = ref('')
const creating = ref(false)
const createError = ref<unknown>(null)

function openNewClaim(): void {
  newTitle.value = ''
  createError.value = null
  newClaimOpen.value = true
}

async function onCreateClaim(): Promise<void> {
  creating.value = true
  createError.value = null
  try {
    const claim = await createClaim(newTitle.value)
    newClaimOpen.value = false
    await router.push(`/claims/${claim.id}/edit`)
  } catch (error) {
    createError.value = error
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <PageHeader title="My claims" description="Create expense claims and track their approval.">
    <BaseButton @click="openNewClaim"><PlusIcon class="size-4" /> New claim</BaseButton>
  </PageHeader>

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
        status === 'all' ? 'Create your first expense claim.' : 'No claims with this status.'
      "
    >
      <BaseButton v-if="status === 'all'" @click="openNewClaim">
        <PlusIcon class="size-4" /> New claim
      </BaseButton>
    </EmptyState>

    <!-- Claims list -->
    <ul
      v-else
      class="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <li v-for="claim in result.data" :key="claim.id">
        <RouterLink
          :to="claimLink(claim)"
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
              {{
                claim.submittedAt
                  ? `Submitted ${formatDateTime(claim.submittedAt)}`
                  : `Created ${formatDateTime(claim.createdAt)}`
              }}
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

  <!-- New claim dialog -->
  <BaseModal v-model:open="newClaimOpen" title="New claim">
    <form class="space-y-4" @submit.prevent="onCreateClaim">
      <ErrorAlert :error="createError" />
      <div>
        <label for="claim-title" class="mb-1 block text-sm font-medium text-slate-700">Title</label>
        <input
          id="claim-title"
          v-model="newTitle"
          type="text"
          required
          maxlength="200"
          placeholder="e.g. Client visit to Mumbai"
          class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
        />
        <p class="mt-1 text-xs text-slate-500">You add line items and receipts next.</p>
      </div>
      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" @click="newClaimOpen = false">Cancel</BaseButton>
        <BaseButton type="submit" :loading="creating">Create draft</BaseButton>
      </div>
    </form>
  </BaseModal>
</template>
