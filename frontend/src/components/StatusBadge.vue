<script setup lang="ts">
import { computed } from 'vue'
import type { ApprovalStatus, ClaimStatus } from '@/types/api'
import { enumLabel } from '@/utils/format'

const { status } = defineProps<{ status: ClaimStatus | ApprovalStatus }>()

// One colour per status (claim and approval statuses share the same meanings)
const STATUS_CLASSES: Record<ClaimStatus | ApprovalStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  WAITING: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  PENDING: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  APPROVED: 'bg-green-50 text-green-700 ring-green-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
  INVALIDATED: 'bg-slate-50 text-slate-400 ring-slate-400/20 line-through',
}

const badgeClass = computed(() => STATUS_CLASSES[status])
const label = computed(() => enumLabel(status))
</script>

<template>
  <span
    :class="badgeClass"
    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset"
  >
    {{ label }}
  </span>
</template>
