<script setup lang="ts">
import { navigateTo } from '#imports'

// Rediriger vers la première feature par défaut
onMounted(() => {
  navigateTo('/dashboard/inge/sessions', { replace: true })
})
</script>

<template>
  <div class="text-center text-sm text-[var(--pds-muted)] py-8">Redirection...</div>
</template>
