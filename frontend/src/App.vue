<script setup lang="ts">
import { ReceiptPercentIcon } from '@heroicons/vue/24/outline'
</script>

<template>
  <!-- Temporary landing card: proves Tailwind and Heroicons work. Replaced by <RouterView /> with the login page -->
  <main class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <div
        class="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
      >
        <ReceiptPercentIcon class="size-7" />
      </div>
      <h1 class="text-2xl font-semibold text-slate-900">Expense Claims</h1>
      <p class="mt-2 text-sm text-slate-500">Frontend is running with Tailwind CSS.</p>
    </div>
  </main>
</template>
