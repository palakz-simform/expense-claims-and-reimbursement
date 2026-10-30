<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'

const { id } = defineProps<{ id: string }>()
</script>

<template>
  <!-- Placeholder until F8 -->
  <PageHeader title="Claim" :description="`Claim ${id}`" back-to="/" back-label="Back" />
</template>
