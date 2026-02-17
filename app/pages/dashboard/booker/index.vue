<script setup lang="ts">
import { navigateTo } from '#imports'

onMounted(() => {
  navigateTo('/dashboard/booker/reserver', { replace: true })
})
</script>

<template>
  <div class="text-center text-sm text-[var(--pds-muted)] py-8">
    Redirection...
  </div>
</template>
