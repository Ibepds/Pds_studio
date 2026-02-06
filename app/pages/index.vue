<template>
  <div class="pds-container flex min-h-[70vh] flex-col justify-center">
    <h1 class="pds-title text-center">
      PDS
    </h1>
    <p class="pds-subtitle mb-12 text-center">
      Studio d'enregistrement
    </p>

    <NuxtLink
      to="/login?role=booker"
      class="btn-primary mb-4 w-full text-center"
    >
      Réserver en tant qu'invité
    </NuxtLink>
    <NuxtLink
      to="/login"
      class="btn-secondary w-full text-center"
    >
      Se connecter
    </NuxtLink>

    <p class="pds-subtitle mt-12 text-center text-sm">
      Booker · Ingé son · Beatmaker
    </p>
  </div>
</template>
