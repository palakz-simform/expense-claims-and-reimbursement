<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  CheckCircleIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import {
  addLineItem,
  deleteClaim,
  deleteLineItem,
  getClaim,
  resubmitClaim,
  submitClaim,
  updateClaimTitle,
  updateLineItem,
  type LineItemInput,
} from '@/api/claims'
import BaseButton from '@/components/BaseButton.vue'
import BaseModal from '@/components/BaseModal.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import LineItemForm from '@/components/claims/LineItemForm.vue'
import ReceiptList from '@/components/claims/ReceiptList.vue'
import type { ClaimDetail, LineItem } from '@/types/api'
import { enumLabel, formatDate, formatMoney } from '@/utils/format'

const { id } = defineProps<{ id: string }>()
const router = useRouter()

// --- Load the claim ---
const claim = ref<ClaimDetail | null>(null)
const loading = ref(true)
const loadError = ref<unknown>(null)

async function loadClaim(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const loaded = await getClaim(id)
    // Approved claims are locked: show the read-only page instead
    if (loaded.status === 'APPROVED') {
      await router.replace(`/claims/${id}`)
      return
    }
    applyClaim(loaded)
  } catch (error) {
    loadError.value = error
  } finally {
    loading.value = false
  }
}

// Write endpoints return the updated claim (with the server's new total); keep fields they may omit
function applyClaim(updated: ClaimDetail): void {
  claim.value = { ...claim.value, ...updated }
  titleDraft.value = updated.title
}

// UI hints only; the backend enforces every rule
const editable = computed(() => claim.value !== null && claim.value.status !== 'APPROVED')
const isDraft = computed(() => claim.value?.status === 'DRAFT')
const isPending = computed(() => claim.value?.status === 'PENDING_APPROVAL')
const isRejected = computed(() => claim.value?.status === 'REJECTED')

// --- Title ---
const titleDraft = ref('')
const titleSaving = ref(false)
const titleError = ref<unknown>(null)
const titleChanged = computed(() => {
  const trimmed = titleDraft.value.trim()
  return trimmed.length > 0 && trimmed !== claim.value?.title
})

async function saveTitle(): Promise<void> {
  titleSaving.value = true
  titleError.value = null
  try {
    const updated = await updateClaimTitle(id, titleDraft.value.trim())
    applyClaim(updated)
  } catch (error) {
    titleError.value = error
  } finally {
    titleSaving.value = false
  }
}

// --- Line items: one form open at a time (add, or edit one item) ---
const addingItem = ref(false)
const editingItemId = ref<string | null>(null)
const itemSaving = ref(false)
const itemError = ref<unknown>(null)
const deletingItemId = ref<string | null>(null)
const deleteItemError = ref<unknown>(null)

function openAddItem(): void {
  editingItemId.value = null
  itemError.value = null
  addingItem.value = true
}

function openEditItem(item: LineItem): void {
  addingItem.value = false
  itemError.value = null
  editingItemId.value = item.id
}

function closeItemForm(): void {
  addingItem.value = false
  editingItemId.value = null
  itemError.value = null
}

async function onAddItem(values: LineItemInput): Promise<void> {
  itemSaving.value = true
  itemError.value = null
  try {
    const updated = await addLineItem(id, values)
    applyClaim(updated)
    closeItemForm()
  } catch (error) {
    itemError.value = error
  } finally {
    itemSaving.value = false
  }
}

async function onSaveItem(itemId: string, values: LineItemInput): Promise<void> {
  itemSaving.value = true
  itemError.value = null
  try {
    const updated = await updateLineItem(id, itemId, values)
    applyClaim(updated)
    closeItemForm()
  } catch (error) {
    itemError.value = error
  } finally {
    itemSaving.value = false
  }
}

async function onDeleteItem(itemId: string): Promise<void> {
  deletingItemId.value = itemId
  deleteItemError.value = null
  try {
    const updated = await deleteLineItem(id, itemId)
    applyClaim(updated)
  } catch (error) {
    // e.g. NO_LINE_ITEMS when removing the last item of a pending claim
    deleteItemError.value = error
  } finally {
    deletingItemId.value = null
  }
}

// --- Submit / resubmit ---
const actionLoading = ref(false)
const actionError = ref<unknown>(null)
const successMessage = ref('')

async function onSubmit(): Promise<void> {
  actionLoading.value = true
  actionError.value = null
  successMessage.value = ''
  try {
    const updated = isRejected.value ? await resubmitClaim(id) : await submitClaim(id)
    applyClaim(updated)
    successMessage.value = 'Submitted for approval.'
  } catch (error) {
    // e.g. NO_LINE_ITEMS, NO_APPROVER_AVAILABLE
    actionError.value = error
  } finally {
    actionLoading.value = false
  }
}

// --- Delete draft (with confirmation) ---
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<unknown>(null)

async function onDeleteClaim(): Promise<void> {
  deleting.value = true
  deleteError.value = null
  try {
    await deleteClaim(id)
    deleteOpen.value = false
    await router.push('/claims')
  } catch (error) {
    deleteError.value = error
  } finally {
    deleting.value = false
  }
}
// Load on open, and again if the route switches to another claim (runs last, after all state exists)
watch(() => id, loadClaim, { immediate: true })
</script>

<template>
  <PageHeader
    :title="claim ? `Claim #${claim.claimNumber}` : 'Claim'"
    description="Add your expenses and receipts, then submit for approval."
    back-to="/claims"
    back-label="My claims"
  >
    <BaseButton v-if="claim" variant="secondary" @click="router.push(`/claims/${id}`)">
      View details
    </BaseButton>
  </PageHeader>

  <!-- Loading and load errors -->
  <div v-if="loading && !claim" class="space-y-3">
    <div class="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
    <div class="h-48 animate-pulse rounded-2xl bg-slate-200/60" />
  </div>
  <ErrorAlert v-else-if="loadError" :error="loadError" />

  <div v-else-if="claim" class="grid gap-6 lg:grid-cols-3">
    <!-- Left: banners, title, line items -->
    <div class="space-y-6 lg:col-span-2">
      <div
        v-if="successMessage"
        class="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-sm text-green-800"
        role="status"
      >
        <CheckCircleIcon class="size-5" />
        {{ successMessage }}
        <RouterLink :to="`/claims/${id}`" class="ml-auto font-semibold underline">
          View approval progress
        </RouterLink>
      </div>

      <!-- Rejected: show why, so the claimant knows what to fix -->
      <div
        v-if="isRejected && claim.lastRejection"
        class="rounded-xl bg-red-50 p-4 text-sm ring-1 ring-red-200"
      >
        <p class="font-semibold text-red-800">
          Rejected by {{ claim.lastRejection.rejectedBy }} (level {{ claim.lastRejection.level }})
        </p>
        <p class="mt-1 text-red-700">“{{ claim.lastRejection.reason }}”</p>
        <p class="mt-2 text-xs text-red-600">Fix the claim below, then resubmit it.</p>
      </div>

      <!-- Pending: editing is allowed, but changing the total restarts approval -->
      <div v-if="isPending" class="flex gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
        <InformationCircleIcon class="size-5 shrink-0" />
        <p>
          This claim is waiting for approval. Changes that alter the total restart approval from
          level 1.
        </p>
      </div>

      <!-- Title -->
      <section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <label for="claim-title" class="mb-1 block text-sm font-medium text-slate-700">Title</label>
        <form class="flex gap-2" @submit.prevent="saveTitle">
          <input
            id="claim-title"
            v-model="titleDraft"
            type="text"
            maxlength="200"
            required
            :disabled="!editable"
            class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:bg-slate-50"
          />
          <BaseButton v-if="titleChanged" type="submit" :loading="titleSaving">Save</BaseButton>
        </form>
        <ErrorAlert :error="titleError" class="mt-3" />
      </section>

      <!-- Line items -->
      <section class="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 class="font-semibold text-slate-900">Line items</h2>
          <BaseButton v-if="editable && !addingItem" variant="secondary" @click="openAddItem">
            <PlusIcon class="size-4" /> Add item
          </BaseButton>
        </div>

        <ErrorAlert :error="deleteItemError" class="mx-5 mt-4" />

        <p
          v-if="claim.lineItems.length === 0 && !addingItem"
          class="px-5 py-10 text-center text-sm text-slate-500"
        >
          No items yet. Add your first expense.
        </p>

        <ul class="divide-y divide-slate-100">
          <li v-for="item in claim.lineItems" :key="item.id" class="px-5 py-4">
            <!-- Edit mode for this item -->
            <LineItemForm
              v-if="editingItemId === item.id"
              :item="item"
              :saving="itemSaving"
              :error="itemError"
              @submit="(values) => onSaveItem(item.id, values)"
              @cancel="closeItemForm"
            />

            <!-- Read mode -->
            <div v-else class="space-y-3">
              <div class="flex items-start gap-4">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-slate-900">{{ item.description }}</p>
                  <p class="mt-0.5 text-xs text-slate-500">
                    {{ formatDate(item.date) }} · {{ enumLabel(item.category) }}
                  </p>
                </div>
                <p class="font-semibold text-slate-900">{{ formatMoney(item.amount) }}</p>
                <div v-if="editable" class="flex gap-1">
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Edit item"
                    @click="openEditItem(item)"
                  >
                    <PencilSquareIcon class="size-4" />
                  </button>
                  <button
                    type="button"
                    :disabled="deletingItemId === item.id"
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    aria-label="Delete item"
                    @click="onDeleteItem(item.id)"
                  >
                    <TrashIcon class="size-4" />
                  </button>
                </div>
              </div>
              <ReceiptList
                :line-item-id="item.id"
                :receipts="item.receipts"
                :editable="editable"
                @changed="loadClaim"
              />
            </div>
          </li>
        </ul>

        <!-- Add mode -->
        <div v-if="addingItem" class="p-5">
          <LineItemForm
            :saving="itemSaving"
            :error="itemError"
            @submit="onAddItem"
            @cancel="closeItemForm"
          />
        </div>
      </section>
    </div>

    <!-- Right: summary and actions -->
    <aside class="lg:sticky lg:top-6 lg:self-start">
      <section class="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">Status</span>
          <StatusBadge :status="claim.status" />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">Items</span>
          <span class="text-sm font-medium text-slate-900">{{ claim.lineItems.length }}</span>
        </div>
        <!-- The total always comes from the server, never added up here -->
        <div class="border-t border-slate-100 pt-4">
          <p class="text-sm text-slate-500">Total</p>
          <p class="text-3xl font-semibold text-slate-900">{{ formatMoney(claim.total) }}</p>
          <p class="mt-1 text-xs text-slate-400">₹10,000 or more needs two approval levels.</p>
        </div>

        <ErrorAlert :error="actionError" />

        <BaseButton
          v-if="isDraft || isRejected"
          class="w-full"
          :loading="actionLoading"
          @click="onSubmit"
        >
          <PaperAirplaneIcon class="size-4" />
          {{ isRejected ? 'Resubmit for approval' : 'Submit for approval' }}
        </BaseButton>
        <BaseButton v-if="isDraft" variant="ghost" class="w-full" @click="deleteOpen = true">
          <TrashIcon class="size-4" /> Delete draft
        </BaseButton>
      </section>
    </aside>
  </div>

  <!-- Delete draft confirmation -->
  <BaseModal v-model:open="deleteOpen" title="Delete this draft?">
    <p class="text-sm text-slate-600">
      The draft, its line items and receipts are removed permanently.
    </p>
    <ErrorAlert :error="deleteError" class="mt-4" />
    <div class="mt-6 flex justify-end gap-2">
      <BaseButton variant="secondary" @click="deleteOpen = false">Cancel</BaseButton>
      <BaseButton variant="danger" :loading="deleting" @click="onDeleteClaim">Delete</BaseButton>
    </div>
  </BaseModal>
</template>
