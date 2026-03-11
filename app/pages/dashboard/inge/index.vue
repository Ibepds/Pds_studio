<script setup lang="ts">
import { navigateTo } from '#imports'

// Rediriger vers la première feature par défaut
onMounted(() => {
  navigateTo('/dashboard/inge/sessions-a-confirmer', { replace: true })
})
</script>

<template>
  <div class="text-center text-sm text-[var(--pds-muted)] py-8">Redirection...</div>
</template>
