<script setup lang="ts">
import { navigateTo } from '#imports'

onMounted(() => {
  navigateTo('/dashboard/beatmaker/prods', { replace: true })
})
</script>

<template>
  <div class="text-center text-sm text-[var(--pds-muted)] py-8">Redirection...</div>
</template>
