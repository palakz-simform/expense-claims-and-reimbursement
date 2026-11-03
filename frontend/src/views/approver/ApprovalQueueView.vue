<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowPathIcon, CheckCircleIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { approveApproval, listApprovals, rejectApproval } from '@/api/approvals'
import { ApiError, fieldErrorsOf } from '@/api/errors'
import BaseButton from '@/components/BaseButton.vue'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { useAuthStore } from '@/stores/auth'
import type { ApprovalDecision, ApprovalQueueItem, Paginated } from '@/types/api'
import { formatDateTime, formatMoney } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// Page number lives in the URL (?page=), so refresh and back keep it
const page = computed({
  get: () => {
    const value = Number(route.query.page)
    return Number.isInteger(value) && value > 0 ? value : 1
  },
  set: (value: number) => {
    void router.replace({ query: { ...route.query, page: String(value) } })
  },
})

// --- Queue state ---
const result = ref<Paginated<ApprovalQueueItem> | null>(null)
const loading = ref(false)
const loadError = ref<unknown>(null)

// Only the newest request may update the queue (a slow older response must not overwrite it)
let latestRequestId = 0

async function loadQueue(): Promise<void> {
  latestRequestId++
  const requestId = latestRequestId
  loading.value = true
  loadError.value = null

  try {
    const data = await listApprovals(page.value)
    if (requestId !== latestRequestId) {
      return
    }
    // A decision can empty the last page: step back to the new last page (the watch reloads it)
    const pageIsEmpty = data.data.length === 0 && page.value > 1
    if (pageIsEmpty) {
      page.value = Math.max(data.pagination.totalPages, 1)
      return
    }
    result.value = data
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

// Reload when the page in the URL changes (and once on first load)
watch(page, loadQueue, { immediate: true })

// --- Decision feedback, shared by approve and reject ---
const notice = ref<string | null>(null)
const decisionError = ref<unknown>(null)
// The approval whose request is in flight; every row's buttons are disabled meanwhile
const decidingId = ref<string | null>(null)

function startDecision(item: ApprovalQueueItem): void {
  decidingId.value = item.id
  notice.value = null
  decisionError.value = null
}

// One sentence about what the decision did to the claim
function describeDecision(item: ApprovalQueueItem, decision: ApprovalDecision): string {
  const label = `Claim #${item.claim.claimNumber}`
  if (decision.status === 'REJECTED') {
    return `${label} rejected. The claimant can fix it and resubmit.`
  }
  if (decision.claim.status === 'APPROVED') {
    return `${label} approved. It is now fully approved.`
  }
  return `${label} approved at level ${decision.level}. It moves to the next level.`
}

// Success: say what happened, then reload so the decided row leaves the queue
async function onDecided(item: ApprovalQueueItem, decision: ApprovalDecision): Promise<void> {
  notice.value = describeDecision(item, decision)
  await loadQueue()
}

// Failure: show the error. APPROVAL_NOT_PENDING means the claim changed first
// (already decided, edited or withdrawn), so the queue is out of date and is reloaded.
async function onDecisionFailed(error: unknown): Promise<void> {
  decisionError.value = error
  const isStale = error instanceof ApiError && error.code === 'APPROVAL_NOT_PENDING'
  if (isStale) {
    await loadQueue()
  }
}

// --- Approve ---
async function onApprove(item: ApprovalQueueItem): Promise<void> {
  startDecision(item)
  try {
    const decision = await approveApproval(item.id)
    await onDecided(item, decision)
  } catch (error) {
    await onDecisionFailed(error)
  } finally {
    decidingId.value = null
  }
}

// --- Reject dialog: a reason is required so the claimant knows what to fix ---
const REASON_MAX = 500
const rejectTarget = ref<ApprovalQueueItem | null>(null)
const rejectOpen = ref(false)
const reason = ref('')
const rejecting = ref(false)
const rejectError = ref<unknown>(null)

// The reason's validation message goes under the textarea; other dialog errors go in its banner
const reasonError = computed(() => fieldErrorsOf(rejectError.value).reason)
const rejectBanner = computed(() => (reasonError.value ? null : rejectError.value))

function openReject(item: ApprovalQueueItem): void {
  rejectTarget.value = item
  reason.value = ''
  rejectError.value = null
  rejectOpen.value = true
}

async function onReject(): Promise<void> {
  const item = rejectTarget.value
  if (!item) {
    return
  }
  startDecision(item)
  rejecting.value = true
  rejectError.value = null
  try {
    const trimmedReason = reason.value.trim()
    const decision = await rejectApproval(item.id, trimmedReason)
    rejectOpen.value = false
    await onDecided(item, decision)
  } catch (error) {
    // A validation error stays in the dialog so the approver can fix the reason
    const isValidation = error instanceof ApiError && error.code === 'VALIDATION_ERROR'
    if (isValidation) {
      rejectError.value = error
    } else {
      rejectOpen.value = false
      await onDecisionFailed(error)
    }
  } finally {
    rejecting.value = false
    decidingId.value = null
  }
}
</script>

<template>
  <PageHeader
    title="Approval queue"
    :description="`Claims waiting for your level ${auth.user?.approvalLevel ?? ''} decision, oldest first.`"
  />

  <!-- Outcome of the last decision -->
  <div
    v-if="notice"
    class="mb-4 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200"
    role="status"
  >
    <CheckCircleIcon class="size-5 shrink-0" /> {{ notice }}
  </div>
  <ErrorAlert :error="decisionError" class="mb-4" />
  <ErrorAlert :error="loadError" class="mb-4" />

  <!-- Loading skeleton on the first load -->
  <div v-if="loading && !result" class="space-y-2">
    <div v-for="row in 4" :key="row" class="h-20 animate-pulse rounded-xl bg-slate-200/60" />
  </div>

  <div v-else-if="result" class="relative">
    <!-- Spinner over the current rows while the queue reloads -->
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
      title="All caught up"
      description="No claims are waiting for your decision."
    />

    <!-- Queue rows: the left part opens the claim; the buttons sit beside the link, never inside it -->
    <ul
      v-else
      class="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <li
        v-for="item in result.data"
        :key="item.id"
        class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6"
      >
        <RouterLink :to="`/claims/${item.claim.id}`" class="group min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-slate-400">#{{ item.claim.claimNumber }}</span>
            <span
              class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200"
            >
              Level {{ item.level }}
            </span>
          </div>
          <p class="mt-1 truncate font-medium text-slate-900 group-hover:text-indigo-600">
            {{ item.claim.title }}
          </p>
          <p class="text-xs text-slate-500">
            {{ item.claim.claimantName }} · Submitted {{ formatDateTime(item.claim.submittedAt) }}
          </p>
        </RouterLink>

        <p class="text-lg font-semibold text-slate-900 sm:text-right">
          {{ formatMoney(item.claim.total) }}
        </p>

        <div class="flex gap-2">
          <BaseButton variant="secondary" :disabled="decidingId !== null" @click="openReject(item)">
            <XMarkIcon class="size-4" /> Reject
          </BaseButton>
          <BaseButton
            :loading="decidingId === item.id && !rejecting"
            :disabled="decidingId !== null"
            @click="onApprove(item)"
          >
            <CheckIcon class="size-4" /> Approve
          </BaseButton>
        </div>
      </li>
    </ul>

    <PaginationBar
      v-model:page="page"
      :total-pages="result.pagination.totalPages"
      :total-items="result.pagination.totalItems"
    />
  </div>

  <!-- Reject dialog -->
  <BaseModal
    v-model:open="rejectOpen"
    :title="rejectTarget ? `Reject claim #${rejectTarget.claim.claimNumber}` : 'Reject claim'"
  >
    <form class="space-y-4" @submit.prevent="onReject">
      <ErrorAlert :error="rejectBanner" />
      <div>
        <label for="reject-reason" class="mb-1 block text-sm font-medium text-slate-700">
          Reason
        </label>
        <textarea
          id="reject-reason"
          v-model="reason"
          required
          rows="4"
          :maxlength="REASON_MAX"
          placeholder="e.g. Hotel receipt for 12 March is missing"
          class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
        />
        <div class="mt-1 flex justify-between gap-4 text-xs">
          <p v-if="reasonError" class="text-red-600">{{ reasonError }}</p>
          <p v-else class="text-slate-500">The claimant sees this reason.</p>
          <p class="text-slate-400">{{ reason.length }}/{{ REASON_MAX }}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" :disabled="rejecting" @click="rejectOpen = false">
          Cancel
        </BaseButton>
        <BaseButton type="submit" variant="danger" :loading="rejecting">Reject claim</BaseButton>
      </div>
    </form>
  </BaseModal>
</template>
