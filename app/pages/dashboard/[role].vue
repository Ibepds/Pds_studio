<script setup lang="ts">
import { navigateTo } from '#imports'
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const roleParam = computed(() => route.params.role as string | undefined)

onMounted(() => {
  if (roleParam.value === 'booker') {
    navigateTo('/dashboard/booker', { replace: true })
  } else if (roleParam.value === 'inge') {
    navigateTo('/dashboard/inge', { replace: true })
  } else if (roleParam.value === 'beatmaker') {
    navigateTo('/dashboard/beatmaker', { replace: true })
  } else {
    navigateTo('/', { replace: true })
  }
})
</script>

<template>
  <section class="pds-container py-10 text-center text-sm text-[var(--pds-muted)]">
    Redirection...
  </section>
</template>
