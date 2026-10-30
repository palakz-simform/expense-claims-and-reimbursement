<script setup lang="ts">
import { InboxIcon } from '@heroicons/vue/24/outline'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <!-- Shown when a list has no rows; the slot holds an optional action button -->
  <div class="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-12 text-center">
    <InboxIcon class="mx-auto size-10 text-slate-300" />
    <h3 class="mt-3 text-sm font-semibold text-slate-900">{{ title }}</h3>
    <p v-if="description" class="mt-1 text-sm text-slate-500">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>
