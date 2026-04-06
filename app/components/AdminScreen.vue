<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div
    class="relative min-h-[50vh] w-full min-w-0 max-w-[1440px] px-4 pb-16 pt-6 sm:px-8 md:px-[120px] md:pt-8"
  >
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0073FF]/15 via-transparent to-transparent blur-3xl"
      aria-hidden="true"
    />

    <div class="relative z-[1] min-w-0">
      <h1
        class="mb-2 font-['Raleway',sans-serif] text-[22px] font-medium leading-tight text-white sm:text-[28px]"
      >
        {{ title }}
      </h1>
      <p
        v-if="subtitle"
        class="mb-8 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[14px] text-white/50 sm:mb-10 sm:text-[15px]"
      >
        {{ subtitle }}
      </p>
      <slot />
    </div>
  </div>
</template>
