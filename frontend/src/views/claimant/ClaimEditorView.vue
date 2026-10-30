<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'

const { id } = defineProps<{ id: string }>()
</script>

<template>
  <!-- Placeholder until F7 -->
  <PageHeader
    title="Edit claim"
    :description="`Claim ${id}`"
    back-to="/claims"
    back-label="My claims"
  />
</template>
