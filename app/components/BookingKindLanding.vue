<script setup lang="ts">
import type { BookingKindOption } from '../types/bookingKind'

withDefaults(
  defineProps<{
    /** Liens vers `/reserver?kind=` (accueil) ou boutons qui émettent `choose` */
    variant: 'links' | 'buttons'
    /** Sort du `max-w-4xl` du dashboard pour le même rendu qu’en pleine largeur */
    fullBleed?: boolean
    /** Espace sous le header global (accueil / reserver plein écran) */
    navSpacerClass?: string
  }>(),
  {
    fullBleed: false,
    navSpacerClass: 'h-[126px]',
  },
)

const emit = defineEmits<{ (e: 'choose', kind: BookingKindOption): void }>()

function choose(kind: BookingKindOption) {
  emit('choose', kind)
}
</script>

<template>
  <section
    class="home-landing relative min-h-[100dvh] w-full min-w-0 overflow-x-clip bg-black font-[Raleway,sans-serif]"
    :class="fullBleed ? 'left-1/2 w-[100vw] max-w-[100vw] -translate-x-1/2' : ''"
  >
    <FigmaLandingBackground />

    <div class="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col px-6 pb-0 pt-0 sm:px-[120px]">
      <div class="shrink-0" :class="navSpacerClass" aria-hidden="true" />

      <div
        class="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-12 lg:flex-row lg:items-start lg:justify-center lg:gap-[200px]"
      >
        <div class="flex w-full min-w-0 max-w-[299px] flex-col gap-[30px]">
          <h1
            class="font-extrabold uppercase leading-none text-white [text-wrap:balance] text-[clamp(1.875rem,8vw,3.125rem)]"
          >
            Beatmaker
          </h1>
          <div class="flex flex-col gap-[15px]">
            <p class="text-[15px] font-normal leading-[18px] text-white">
              Travaille avec un beatmaker pour créer une instru originale adaptée à ton style. Idéal pour composer un
              morceau unique ou développer une idée musicale.
            </p>
            <div class="flex flex-wrap items-center gap-[7.5px]">
              <span class="home-tag">1h</span>
              <span class="h-1 w-1 shrink-0 rounded-full bg-white" aria-hidden="true" />
              <span class="home-tag">40€</span>
            </div>
          </div>
          <NuxtLink
            v-if="variant === 'links'"
            to="/reserver?kind=beatmaker"
            class="home-choose-btn inline-flex h-[49px] w-[125px] items-center justify-center rounded-full border border-white/50 text-[18px] font-medium leading-none text-white transition-[background,border-color,color] duration-200"
          >
            Choisir
          </NuxtLink>
          <button
            v-else
            type="button"
            class="home-choose-btn inline-flex h-[49px] w-[125px] items-center justify-center rounded-full border border-white/50 text-[18px] font-medium leading-none text-white transition-[background,border-color,color] duration-200"
            @click="choose('beatmaker')"
          >
            Choisir
          </button>
        </div>

        <div class="flex w-full min-w-0 max-w-[471px] flex-col gap-[30px]">
          <h2
            class="font-extrabold uppercase leading-none text-white [text-wrap:balance] text-[clamp(1.875rem,8vw,3.125rem)]"
          >
            Ingénieur du son
          </h2>
          <div class="flex flex-col gap-[15px]">
            <p class="text-[15px] font-normal leading-[18px] text-white">
              Enregistre ta voix ou tes instruments avec un ingénieur du son qui t'accompagne pendant toute la session. Il
              s'occupe de la prise de son et des réglages pour garantir un enregistrement propre et de qualité studio,
              prêt pour le mixage.
            </p>
            <div class="flex flex-wrap items-center gap-[7.5px]">
              <span class="home-tag">1h</span>
              <span class="h-1 w-1 shrink-0 rounded-full bg-white" aria-hidden="true" />
              <span class="home-tag">24€</span>
            </div>
          </div>
          <NuxtLink
            v-if="variant === 'links'"
            to="/reserver?kind=inge"
            class="home-choose-btn inline-flex h-[49px] w-[125px] items-center justify-center rounded-full border border-white/50 text-[18px] font-medium leading-none text-white transition-[background,border-color,color] duration-200"
          >
            Choisir
          </NuxtLink>
          <button
            v-else
            type="button"
            class="home-choose-btn inline-flex h-[49px] w-[125px] items-center justify-center rounded-full border border-white/50 text-[18px] font-medium leading-none text-white transition-[background,border-color,color] duration-200"
            @click="choose('inge')"
          >
            Choisir
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 18px;
  border: 0.14px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  font-size: 9.92px;
  font-weight: 500;
  line-height: 22px;
  color: #ffffff;
}
</style>
