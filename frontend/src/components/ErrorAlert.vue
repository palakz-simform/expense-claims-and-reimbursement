<script setup lang="ts">
import { computed } from 'vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { ApiError } from '@/api/errors'

// Accepts whatever a catch block caught; renders nothing when there is no error
const { error } = defineProps<{ error: unknown }>()

const message = computed(() => {
  if (error instanceof ApiError) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Something went wrong. Please try again.'
})

// The request id lets a bug report be matched to the server log line
const requestId = computed(() => (error instanceof ApiError ? error.requestId : undefined))
</script>

<template>
  <div v-if="error" class="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm" role="alert">
    <ExclamationTriangleIcon class="size-5 shrink-0 text-red-500" />
    <div>
      <p class="font-medium text-red-800">{{ message }}</p>
      <p v-if="requestId" class="mt-1 text-xs text-red-600/80">Reference: {{ requestId }}</p>
    </div>
  </div>
</template>
