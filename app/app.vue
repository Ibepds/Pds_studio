<template>
  <div class="min-h-screen bg-[var(--pds-bg)] text-[var(--pds-text)]">
    <header class="border-b border-[var(--pds-border)] bg-[var(--pds-card)]/80">
      <nav class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <NuxtLink to="/" class="text-xl font-light tracking-[0.2em] text-white">
          PDS
        </NuxtLink>
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/login"
            class="btn-secondary !py-2 !px-4 !text-sm"
          >
            Se connecter
          </NuxtLink>
          <NuxtLink
            to="/register"
            class="btn-primary !py-2 !px-4 !text-sm"
          >
            Inscription
          </NuxtLink>
        </div>
      </nav>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-8">
      <NuxtPage />
    </main>
  </div>
</template>
