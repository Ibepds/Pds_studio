<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Landing: positions actuelles. Slot: maquette « Sélection du créneau » (ellipses basses). */
    variant?: 'landing' | 'slot'
  }>(),
  { variant: 'landing' },
)
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <template v-if="variant === 'slot'">
      <div
        class="figma-ellipse figma-ellipse-cyan absolute rounded-full"
        style="width: 3274px; height: 674px; left: -917px; top: 248px"
      />
      <div
        class="figma-ellipse figma-ellipse-blue absolute rounded-full"
        style="width: 2844px; height: 674px; left: -702px; top: 248px"
      />
      <div
        class="figma-ellipse figma-ellipse-navy absolute rounded-full"
        style="width: 2082px; height: 674px; left: -321px; top: 248px"
      />
      <div
        class="figma-ellipse figma-ellipse-dark absolute rounded-full"
        style="width: 1628px; height: 1071px; left: -94px; top: -346px"
      />
      <div
        class="figma-ellipse figma-ellipse-dark absolute rounded-full"
        style="width: 1628px; height: 848px; left: -94px; top: 74px"
      />
    </template>
    <template v-else>
      <div
        class="figma-ellipse figma-ellipse-cyan absolute rounded-full"
        style="width: 3274px; height: 674px; left: -917px; top: 136px"
      />
      <div
        class="figma-ellipse figma-ellipse-blue absolute rounded-full"
        style="width: 2844px; height: 674px; left: -702px; top: 136px"
      />
      <div
        class="figma-ellipse figma-ellipse-navy absolute rounded-full"
        style="width: 2082px; height: 674px; left: -321px; top: 136px"
      />
      <div
        class="figma-ellipse figma-ellipse-dark absolute rounded-full"
        style="width: 1628px; height: 848px; left: -94px; top: -378px"
      />
      <div
        class="figma-ellipse figma-ellipse-dark absolute rounded-full"
        style="width: 1628px; height: 848px; left: -94px; top: -38px"
      />
    </template>
  </div>
</template>

<style scoped>
.figma-ellipse {
  filter: blur(35px);
}
.figma-ellipse-cyan {
  background: #64e8ff;
}
.figma-ellipse-blue {
  background: #0073ff;
}
.figma-ellipse-navy {
  background: #00061b;
}
.figma-ellipse-dark {
  background: #0e0e0e;
}
</style>
