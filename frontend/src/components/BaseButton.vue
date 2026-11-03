<script setup lang="ts">
import { computed } from 'vue'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const {
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled = false,
} = defineProps<{
  variant?: Variant
  type?: 'button' | 'submit'
  loading?: boolean
  disabled?: boolean
}>()

// Colours per variant
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500',
  secondary: 'bg-white text-slate-700 shadow-xs ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
}

const variantClass = computed(() => VARIANT_CLASSES[variant])
</script>

<template>
  <!-- Disabled while loading, so a double click cannot send the request twice -->
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="variantClass"
    class="inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
  >
    <ArrowPathIcon v-if="loading" class="size-4 animate-spin" />
    <slot />
  </button>
</template>
