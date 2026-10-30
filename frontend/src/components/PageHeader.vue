<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <!-- Page title on the left, page actions (slot) on the right; stacks on small screens -->
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-slate-900">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-sm text-slate-500">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="flex shrink-0 gap-2">
      <slot />
    </div>
  </div>
</template>
