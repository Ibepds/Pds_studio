<script setup lang="ts">
import { ref } from 'vue'
import type { BookingKindOption } from '../../../types/bookingKind'

const bookingKind = ref<BookingKindOption | null>(null)

function onContinue(kind: BookingKindOption) {
  bookingKind.value = kind
}
</script>

<template>
  <div class="space-y-8">
    <BookingKindLanding
      v-if="!bookingKind"
      variant="buttons"
      full-bleed
      nav-spacer-class="h-8 sm:h-12"
      @choose="onContinue"
    />
    <template v-else>
      <button
        type="button"
        class="text-sm text-[var(--pds-muted)] hover:text-[var(--pds-primary)]"
        @click="bookingKind = null"
      >
        ← Changer le type de session
      </button>
      <Booker
        mode="reserver"
        :booking-kind="bookingKind"
        @booked="bookingKind = null"
        @back-kind="bookingKind = null"
      />
    </template>
  </div>
</template>
