<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PencilSquareIcon } from '@heroicons/vue/24/outline'
import { getClaim, getClaimHistory } from '@/api/claims'
import BaseButton from '@/components/BaseButton.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ApprovalChain from '@/components/claims/ApprovalChain.vue'
import HistoryTimeline from '@/components/claims/HistoryTimeline.vue'
import ReceiptList from '@/components/claims/ReceiptList.vue'
import { useAuthStore } from '@/stores/auth'
import type { ClaimDetail, HistoryEntry, Role } from '@/types/api'
import { enumLabel, formatDate, formatDateTime, formatMoney } from '@/utils/format'

// Read-only claim page for every role. The API decides visibility: a claim outside the user's scope is a 404.
const { id } = defineProps<{ id: string }>()
const auth = useAuthStore()
const router = useRouter()

// Back link goes to the user's own home page
const BACK_LABEL_BY_ROLE: Record<Role, string> = {
  CLAIMANT: 'My claims',
  APPROVER: 'Approval queue',
  FINANCE: 'Approved claims',
}
const backLabel = computed(() => (auth.user ? BACK_LABEL_BY_ROLE[auth.user.role] : 'Back'))

// --- Load the claim and the first page of history together ---
const claim = ref<ClaimDetail | null>(null)
const history = ref<HistoryEntry[]>([])
const historyPage = ref(1)
const historyPages = ref(1)
const loading = ref(true)
const loadError = ref<unknown>(null)

async function loadAll(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const [loadedClaim, firstHistoryPage] = await Promise.all([getClaim(id), getClaimHistory(id)])
    claim.value = loadedClaim
    history.value = firstHistoryPage.data
    historyPage.value = 1
    historyPages.value = firstHistoryPage.pagination.totalPages
  } catch (error) {
    loadError.value = error
  } finally {
    loading.value = false
  }
}

// --- Older claims can have more than 100 history rows: load the next page on demand ---
const loadingMore = ref(false)
const moreError = ref<unknown>(null)

async function loadMoreHistory(): Promise<void> {
  loadingMore.value = true
  moreError.value = null
  try {
    const nextPage = historyPage.value + 1
    const result = await getClaimHistory(id, nextPage)
    history.value = [...history.value, ...result.data]
    historyPage.value = nextPage
  } catch (error) {
    moreError.value = error
  } finally {
    loadingMore.value = false
  }
}

// UI hint only: the claimant may edit until the claim is approved
const canEdit = computed(
  () => auth.hasRole('CLAIMANT') && claim.value !== null && claim.value.status !== 'APPROVED',
)

watch(() => id, loadAll, { immediate: true })
</script>

<template>
  <PageHeader
    :title="claim ? `Claim #${claim.claimNumber}` : 'Claim'"
    :description="claim?.title"
    :back-to="auth.homePath"
    :back-label="backLabel"
  >
    <BaseButton v-if="canEdit" variant="secondary" @click="router.push(`/claims/${id}/edit`)">
      <PencilSquareIcon class="size-4" /> Edit claim
    </BaseButton>
  </PageHeader>

  <!-- Loading and load errors (404 for claims outside the user's scope) -->
  <div v-if="loading && !claim" class="grid gap-6 lg:grid-cols-3">
    <div class="h-64 animate-pulse rounded-2xl bg-slate-200/60 lg:col-span-2" />
    <div class="h-64 animate-pulse rounded-2xl bg-slate-200/60" />
  </div>
  <ErrorAlert v-else-if="loadError" :error="loadError" />

  <div v-else-if="claim" class="grid gap-6 lg:grid-cols-3">
    <!-- Left: rejection reason, line items, history -->
    <div class="space-y-6 lg:col-span-2">
      <div
        v-if="claim.status === 'REJECTED' && claim.lastRejection"
        class="rounded-xl bg-red-50 p-4 text-sm ring-1 ring-red-200"
      >
        <p class="font-semibold text-red-800">
          Rejected by {{ claim.lastRejection.rejectedBy }} (level {{ claim.lastRejection.level }}) ·
          {{ formatDateTime(claim.lastRejection.rejectedAt) }}
        </p>
        <p class="mt-1 text-red-700">“{{ claim.lastRejection.reason }}”</p>
      </div>

      <section class="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 class="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Line items</h2>
        <p v-if="claim.lineItems.length === 0" class="px-5 py-8 text-center text-sm text-slate-500">
          No line items.
        </p>
        <ul class="divide-y divide-slate-100">
          <li v-for="item in claim.lineItems" :key="item.id" class="space-y-3 px-5 py-4">
            <div class="flex items-start gap-4">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-slate-900">{{ item.description }}</p>
                <p class="mt-0.5 text-xs text-slate-500">
                  {{ formatDate(item.date) }} · {{ enumLabel(item.category) }}
                </p>
              </div>
              <p class="font-semibold text-slate-900">{{ formatMoney(item.amount) }}</p>
            </div>
            <!-- Download only: every role that can see the claim can download its receipts -->
            <ReceiptList
              v-if="item.receipts.length > 0"
              :line-item-id="item.id"
              :receipts="item.receipts"
              :editable="false"
            />
          </li>
        </ul>
      </section>

      <section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 class="mb-4 font-semibold text-slate-900">History</h2>
        <HistoryTimeline :entries="history" />
        <ErrorAlert :error="moreError" class="mt-4" />
        <BaseButton
          v-if="historyPage < historyPages"
          variant="secondary"
          class="mt-4"
          :loading="loadingMore"
          @click="loadMoreHistory"
        >
          Load more
        </BaseButton>
      </section>
    </div>

    <!-- Right: summary and approval chain -->
    <aside class="space-y-6 lg:sticky lg:top-6 lg:self-start">
      <section class="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">Status</span>
          <StatusBadge :status="claim.status" />
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500">Submitted</span>
          <span class="text-slate-900">{{ formatDateTime(claim.submittedAt) }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500">Approved</span>
          <span class="text-slate-900">{{ formatDateTime(claim.approvedAt) }}</span>
        </div>
        <div class="border-t border-slate-100 pt-3">
          <p class="text-sm text-slate-500">Total</p>
          <p class="text-3xl font-semibold text-slate-900">{{ formatMoney(claim.total) }}</p>
        </div>
      </section>

      <section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 class="mb-4 font-semibold text-slate-900">Approval chain</h2>
        <ApprovalChain :steps="claim.approvals ?? []" />
      </section>
    </aside>
  </div>
</template>
