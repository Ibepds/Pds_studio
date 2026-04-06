<script setup lang="ts">
defineProps<{
  label: string
}>()

defineEmits<{
  prev: []
  next: []
}>()
</script>

<template>
  <div
    class="inline-flex max-w-full flex-wrap items-center justify-center gap-3 rounded-full border border-white/20 bg-black/30 px-3 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white/90 sm:max-w-none"
  >
    <button
      type="button"
      class="pds-sessions-ui shrink-0 rounded-full px-2 py-1 text-white/80 transition hover:bg-white/10 hover:text-white"
      aria-label="Mois précédent"
      @click="$emit('prev')"
    >
      ‹
    </button>
    <span class="min-w-0 flex-1 text-center capitalize sm:min-w-[10rem] sm:flex-none">{{
      label
    }}</span>
    <button
      type="button"
      class="pds-sessions-ui shrink-0 rounded-full px-2 py-1 text-white/80 transition hover:bg-white/10 hover:text-white"
      aria-label="Mois suivant"
      @click="$emit('next')"
    >
      ›
    </button>
  </div>
</template>
