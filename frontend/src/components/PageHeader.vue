<script setup lang="ts">
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'

// backTo/backLabel add a "← My claims" link above the title on sub-pages
defineProps<{ title: string; description?: string; backTo?: string; backLabel?: string }>()
</script>

<template>
  <div class="mb-6">
    <RouterLink
      v-if="backTo"
      :to="backTo"
      class="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
    >
      <ArrowLeftIcon class="size-4" />
      {{ backLabel ?? 'Back' }}
    </RouterLink>

    <!-- Page title on the left, page actions (slot) on the right; stacks on small screens -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">{{ title }}</h1>
        <p v-if="description" class="mt-1 text-sm text-slate-500">{{ description }}</p>
      </div>
      <div v-if="$slots.default" class="flex shrink-0 gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>
