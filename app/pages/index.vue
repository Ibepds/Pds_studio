<template>
  <section
    class="home-marketing relative min-h-[100dvh] w-full overflow-hidden bg-black font-[Raleway,sans-serif]"
  >
    <FigmaLandingBackground />

    <div
      class="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col px-6 pb-0 pt-0 sm:px-[120px]"
    >
      <!-- Espace nav Figma ~126px -->
      <div class="h-[126px] shrink-0" aria-hidden="true" />

      <!-- Texte + CTA : gap 95px, zone ~560px -->
      <div
        class="flex min-h-0 flex-1 flex-col items-center justify-center gap-12 pt-10 pb-0 lg:flex-row lg:items-center lg:justify-center lg:gap-[95px] lg:py-0 lg:min-h-[560px]"
      >
        <!-- Colonne texte -->
        <div class="flex w-full max-w-[578px] flex-col gap-5">
          <h1
            class="text-white [text-wrap:balance] font-normal uppercase tracking-[-0.02em] text-[clamp(1.75rem,6.5vw,4.375rem)] leading-[1.05] lg:text-[70px] lg:leading-[60px]"
          >
            Réservez votre session studio en quelques minutes
          </h1>

          <div
            class="flex flex-wrap items-center gap-[7.5px] text-white"
            aria-label="Services : booker, ingénieur du son, beatmaker"
          >
            <span class="home-hero-pill">
              <svg
                class="home-hero-pill-icon shrink-0"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Booker</span>
            </span>
            <span class="home-hero-dot" aria-hidden="true" />
            <span class="home-hero-pill">
              <svg
                class="home-hero-pill-icon shrink-0"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M3 18v-6a9 9 0 0118 0v6M3 18h3a2 2 0 002-2v-1a2 2 0 012-2h4a2 2 0 012 2v1a2 2 0 002 2h3M3 18v3M21 18v3"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Ingénieur du son</span>
            </span>
            <span class="home-hero-dot" aria-hidden="true" />
            <span class="home-hero-pill">
              <svg
                class="home-hero-pill-icon shrink-0"
                width="22"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Beatmaker</span>
            </span>
          </div>
        </div>

        <!-- Colonne CTA -->
        <div class="flex w-full max-w-[384px] flex-col gap-[15px]">
          <NuxtLink to="/reserver" class="home-hero-cta">
            Réserver en tant qu'invité
          </NuxtLink>
          <NuxtLink to="/login" class="home-hero-cta"> Se connecter </NuxtLink>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
})
</script>

<style scoped>
.home-hero-pill {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 2.57px 18.34px;
  border: 0.14px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  font-size: 9.92px;
  font-weight: 500;
  line-height: 22px;
  color: #ffffff;
}
.home-hero-pill-icon {
  color: #ffffff;
}
.home-hero-dot {
  width: 4.5px;
  height: 4.5px;
  border-radius: 999px;
  background: #ffffff;
  flex-shrink: 0;
}
.home-hero-cta {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  max-width: 384px;
  min-height: 49.24px;
  align-items: center;
  justify-content: center;
  padding: 4.66px 33.27px;
  border: 0.25px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  font-size: 18px;
  font-weight: 500;
  line-height: 40px;
  color: #ffffff;
  text-align: center;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
</style>
