<script setup lang="ts">
import { CheckIcon, ClockIcon, EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import StatusBadge from '@/components/StatusBadge.vue'
import type { ApprovalStatus, ApprovalStep } from '@/types/api'
import { formatDateTime } from '@/utils/format'

// The live approval chain, one step per level (empty for a draft)
defineProps<{ steps: ApprovalStep[] }>()

// Circle colour and icon per step status
const CIRCLE_CLASSES: Record<ApprovalStatus, string> = {
  WAITING: 'bg-slate-100 text-slate-400',
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  INVALIDATED: 'bg-slate-100 text-slate-300',
}
</script>

<template>
  <p v-if="steps.length === 0" class="text-sm text-slate-500">
    Not submitted yet. The approval chain is created on submit.
  </p>

  <ol v-else class="space-y-4">
    <li v-for="step in steps" :key="step.level" class="flex items-start gap-3">
      <span
        :class="CIRCLE_CLASSES[step.status]"
        class="flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <CheckIcon v-if="step.status === 'APPROVED'" class="size-4" />
        <XMarkIcon v-else-if="step.status === 'REJECTED'" class="size-4" />
        <ClockIcon v-else-if="step.status === 'PENDING'" class="size-4" />
        <EllipsisHorizontalIcon v-else class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm font-medium text-slate-900">Level {{ step.level }}</p>
          <StatusBadge :status="step.status" />
        </div>
        <p class="text-sm text-slate-600">{{ step.approverName }}</p>
        <p class="text-xs text-slate-400">
          {{
            step.decidedAt
              ? `Decided ${formatDateTime(step.decidedAt)}`
              : step.status === 'WAITING'
                ? 'Waits for the previous level'
                : 'Awaiting decision'
          }}
        </p>
      </div>
    </li>
  </ol>
</template>
