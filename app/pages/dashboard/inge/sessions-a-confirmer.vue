<script setup lang="ts">
import { onMounted } from 'vue'
import { navigateTo } from '#imports'

onMounted(() => {
  navigateTo('/dashboard/inge/sessions', { replace: true })
})
</script>

<template>
  <div class="py-8 text-center text-sm text-white/50">Redirection…</div>
</template>
