<script setup lang="ts">
import type { AuditAction, HistoryEntry } from '@/types/api'
import { enumLabel, formatDateTime, formatMoney } from '@/utils/format'

// The claim's audit trail, oldest first
defineProps<{ entries: HistoryEntry[] }>()

// Dot colour per kind of event
const DOT_CLASSES: Partial<Record<AuditAction, string>> = {
  CLAIM_APPROVED: 'bg-green-500',
  APPROVAL_GRANTED: 'bg-green-400',
  CLAIM_REJECTED: 'bg-red-500',
  APPROVAL_CHAIN_RESET: 'bg-amber-500',
  CLAIM_SUBMITTED: 'bg-indigo-500',
  CLAIM_RESUBMITTED: 'bg-indigo-500',
}

// Read a text value from the free-form metadata (null if missing or not text/number)
function metaText(entry: HistoryEntry, key: string): string | null {
  const value = entry.metadata?.[key]
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  return null
}

// One human sentence per event, using the metadata the backend recorded
function describe(entry: HistoryEntry): string {
  const level = metaText(entry, 'level')
  const oldTotal = metaText(entry, 'oldTotal')
  const newTotal = metaText(entry, 'newTotal')

  switch (entry.action) {
    case 'CLAIM_CREATED':
      return 'Created the claim'
    case 'CLAIM_SUBMITTED':
      return 'Submitted for approval'
    case 'CLAIM_RESUBMITTED':
      return 'Resubmitted for approval'
    case 'APPROVAL_GRANTED':
      return level ? `Approved level ${level}` : 'Approved a level'
    case 'CLAIM_APPROVED':
      return 'Claim fully approved'
    case 'CLAIM_REJECTED':
      return level ? `Rejected at level ${level}` : 'Rejected the claim'
    case 'APPROVAL_CHAIN_RESET':
      return oldTotal && newTotal
        ? `Approval restarted: total changed ${formatMoney(oldTotal)} → ${formatMoney(newTotal)}`
        : 'Approval restarted'
    case 'CLAIM_UPDATED': {
      const change = metaText(entry, 'change') ?? 'claim edited'
      const totalChanged = oldTotal && newTotal && oldTotal !== newTotal
      const sentence = change.charAt(0).toUpperCase() + change.slice(1)
      return totalChanged
        ? `${sentence} (${formatMoney(oldTotal)} → ${formatMoney(newTotal)})`
        : sentence
    }
    case 'RECEIPT_ADDED':
      return 'Added a receipt'
    case 'RECEIPT_REMOVED': {
      const name = metaText(entry, 'originalName')
      return name ? `Removed receipt ${name}` : 'Removed a receipt'
    }
    default:
      return enumLabel(entry.action)
  }
}
</script>

<template>
  <p v-if="entries.length === 0" class="text-sm text-slate-500">No history yet.</p>

  <ol v-else class="relative space-y-5 border-l border-slate-200 pl-6">
    <li v-for="entry in entries" :key="entry.id" class="relative">
      <span
        :class="DOT_CLASSES[entry.action] ?? 'bg-slate-300'"
        class="absolute top-1.5 -left-[1.85rem] size-2.5 rounded-full ring-4 ring-white"
      />
      <p class="text-sm text-slate-900">{{ describe(entry) }}</p>
      <p v-if="entry.reason" class="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        “{{ entry.reason }}”
      </p>
      <p class="mt-0.5 text-xs text-slate-400">
        {{ entry.performedBy.name }} · {{ enumLabel(entry.performedBy.role) }} ·
        {{ formatDateTime(entry.createdAt) }}
      </p>
    </li>
  </ol>
</template>
