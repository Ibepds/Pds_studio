<script setup lang="ts">
import { definePageMeta } from '#imports'

definePageMeta({
  middleware: ['require-auth', 'admin-index-redirect'],
  role: 'admin',
})
</script>

<template>
  <div class="px-4 py-8 text-center text-sm text-white/50 md:px-[120px]">Redirection…</div>
</template>
