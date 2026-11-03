<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'

// v-model:page from the parent; the other values come from the API's pagination object
const page = defineModel<number>('page', { required: true })
const { totalPages, totalItems } = defineProps<{ totalPages: number; totalItems: number }>()

const hasPrevious = computed(() => page.value > 1)
const hasNext = computed(() => page.value < totalPages)
</script>

<template>
  <div v-if="totalPages > 1" class="flex items-center justify-between gap-4 pt-4 text-sm">
    <p class="text-slate-500">
      Page <span class="font-medium text-slate-900">{{ page }}</span> of
      <span class="font-medium text-slate-900">{{ totalPages }}</span>
      · {{ totalItems }} total
    </p>
    <div class="flex gap-2">
      <button
        type="button"
        :disabled="!hasPrevious"
        class="flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        @click="page--"
      >
        <ChevronLeftIcon class="size-4" /> Previous
      </button>
      <button
        type="button"
        :disabled="!hasNext"
        class="flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        @click="page++"
      >
        Next <ChevronRightIcon class="size-4" />
      </button>
    </div>
  </div>
</template>
