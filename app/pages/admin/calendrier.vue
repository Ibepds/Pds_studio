<script setup lang="ts">
import { definePageMeta } from '#imports'
import { onMounted, ref } from 'vue'
import { useSessions } from '../../../composables/useSessions'
import { useUsers } from '../../../composables/useUsers'
import { firstDayOfMonthMonthsAgo } from '../../../utils/adminMonth'

definePageMeta({
  middleware: 'require-auth',
  role: 'admin',
})

const { listAllFromDate } = useSessions()
const { listByRole } = useUsers()
const sessions = ref<any[]>([])
const ingeList = ref<{ uid: string; email?: string | null }[]>([])
const loading = ref(true)

/** Assez large pour naviguer semaine par semaine (≈ 18 mois en arrière). */
const fromDate = firstDayOfMonthMonthsAgo(18)

onMounted(async () => {
  loading.value = true
  try {
    const [s, i] = await Promise.all([listAllFromDate(fromDate), listByRole('inge')])
    sessions.value = s
    ingeList.value = i
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AdminScreen
    title="Calendrier"
    subtitle="Vue semaine — toutes les sessions chargées depuis le mois affiché dans la grille (≈ 18 derniers mois)."
  >
    <div v-if="loading" class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/55">
      Chargement…
    </div>
    <div v-else class="rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6">
      <p
        class="mb-4 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] font-normal uppercase tracking-[0.14em] text-white/45"
      >
        Planning
      </p>
      <h2 class="mb-4 font-['Raleway',sans-serif] text-[17px] font-medium text-white sm:text-[18px]">
        Semaine
      </h2>
      <div class="min-w-0">
        <WeekCalendar :sessions="sessions" :inge-list="ingeList" />
      </div>
    </div>
  </AdminScreen>
</template>
