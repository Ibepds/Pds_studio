<script setup lang="ts">
import { definePageMeta } from '#imports'
import { computed, ref, watch } from 'vue'
import { useSessions } from '../../../composables/useSessions'
import { useAdminMonthNav } from '../../../composables/useAdminMonthNav'
import { restToPayForSession } from '../../../composables/useAdminSessionHelpers'

definePageMeta({
  middleware: 'require-auth',
  role: 'admin',
})

const { listSessionsInDateRange } = useSessions()
const { label, range, prevMonth, nextMonth, year, month } = useAdminMonthNav()

const sessions = ref<any[]>([])
const loading = ref(false)

async function loadMonth() {
  loading.value = true
  try {
    const r = range.value
    sessions.value = await listSessionsInDateRange(r.start, r.end)
  } finally {
    loading.value = false
  }
}

watch([year, month], () => loadMonth(), { immediate: true })

const restToPayMonth = computed(() =>
  sessions.value.reduce((sum, s) => {
    if (s.status === 'pending' || s.status === 'confirmed') {
      return sum + restToPayForSession(s)
    }
    return sum
  }, 0),
)

const totalMoneyMonth = computed(() =>
  sessions.value
    .filter((s) => s.status === 'confirmed' || s.status === 'done')
    .reduce((sum, s) => sum + (s.totalPrice ?? 0), 0),
)

const confirmedByIngeCount = computed(
  () => sessions.value.filter((s) => s.ingeId).length,
)

const sessionsCount = computed(() => sessions.value.length)
</script>

<template>
  <AdminScreen
    title="Indicateurs"
    subtitle="Chiffres pour le mois sélectionné (mois précédents et suivants)."
  >
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p
        class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] font-normal uppercase tracking-[0.14em] text-white/45"
      >
        Période
      </p>
      <AdminMonthPicker :label="label" @prev="prevMonth" @next="nextMonth" />
    </div>

    <div v-if="loading" class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/55">
      Chargement…
    </div>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-5 sm:px-6">
        <h3
          class="mb-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[12px] uppercase tracking-wide text-white/45"
        >
          Reste à payer (mois)
        </h3>
        <p
          class="bg-gradient-to-r from-[#0073FF] to-[#64E8FF] bg-clip-text font-['Raleway',sans-serif] text-3xl font-semibold text-transparent"
        >
          {{ restToPayMonth }}€
        </p>
      </div>
      <div class="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-5 sm:px-6">
        <h3
          class="mb-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[12px] uppercase tracking-wide text-white/45"
        >
          Total encaissé (confirmées / faites)
        </h3>
        <p
          class="bg-gradient-to-r from-[#0073FF] to-[#64E8FF] bg-clip-text font-['Raleway',sans-serif] text-3xl font-semibold text-transparent"
        >
          {{ totalMoneyMonth }}€
        </p>
      </div>
      <div class="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-5 sm:px-6">
        <h3
          class="mb-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[12px] uppercase tracking-wide text-white/45"
        >
          Sessions avec ingé
        </h3>
        <p
          class="bg-gradient-to-r from-[#0073FF] to-[#64E8FF] bg-clip-text font-['Raleway',sans-serif] text-3xl font-semibold text-transparent"
        >
          {{ confirmedByIngeCount }}
        </p>
      </div>
      <div class="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-5 sm:px-6">
        <h3
          class="mb-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[12px] uppercase tracking-wide text-white/45"
        >
          Sessions (mois)
        </h3>
        <p
          class="bg-gradient-to-r from-[#0073FF] to-[#64E8FF] bg-clip-text font-['Raleway',sans-serif] text-3xl font-semibold text-transparent"
        >
          {{ sessionsCount }}
        </p>
      </div>
    </div>
  </AdminScreen>
</template>
