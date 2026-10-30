<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <!-- Placeholder until F6 -->
  <h1 class="text-2xl font-semibold text-slate-900">My claims</h1>
  <p class="mt-1 text-sm text-slate-500">Signed in as {{ auth.user?.email }}</p>
</template>
