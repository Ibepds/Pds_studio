<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAvailability } from '../../composables/useAvailability'
import { SLOT_START_HOUR, SLOT_END_HOUR } from '../../utils/pricing'
import type { TimeSlot } from '../../composables/useAvailability'

const { setSlotsForDate, getMySlotsForDate } = useAvailability()

const availabilityMonth = ref(new Date())
const availabilityDate = ref<string>('')
const slotsForSelectedDate = ref<TimeSlot[]>([])
const loadingSlots = ref(false)
const savingSlots = ref(false)
const addSlotStart = ref(10)
const addSlotEnd = ref(12)

const hourOptions = computed(() => {
  const h: number[] = []
  for (let i = SLOT_START_HOUR; i <= SLOT_END_HOUR; i++) h.push(i)
  return h
})

const availabilityCalendarDays = computed(() => {
  const y = availabilityMonth.value.getFullYear()
  const m = availabilityMonth.value.getMonth()
  const first = new Date(y, m, 1)
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const days: { day: number | null; dateStr: string; disabled: boolean }[] = []
  for (let i = 0; i < startOffset; i++) days.push({ day: null, dateStr: '', disabled: true })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ day: d, dateStr, disabled: dateStr < today })
  }
  return days
})

const availabilityMonthLabel = computed(() => {
  const months = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ]
  return `${months[availabilityMonth.value.getMonth()]} ${availabilityMonth.value.getFullYear()}`
})

watch(availabilityDate, async (d) => {
  if (!d) {
    slotsForSelectedDate.value = []
    return
  }
  loadingSlots.value = true
  try {
    slotsForSelectedDate.value = await getMySlotsForDate(d)
    addSlotStart.value = SLOT_START_HOUR
    addSlotEnd.value = SLOT_START_HOUR + 2
  } finally {
    loadingSlots.value = false
  }
})

function prevAvailabilityMonth() {
  availabilityMonth.value = new Date(
    availabilityMonth.value.getFullYear(),
    availabilityMonth.value.getMonth() - 1,
    1,
  )
}
function nextAvailabilityMonth() {
  availabilityMonth.value = new Date(
    availabilityMonth.value.getFullYear(),
    availabilityMonth.value.getMonth() + 1,
    1,
  )
}
function selectAvailabilityDate(dateStr: string) {
  if (!dateStr) return
  availabilityDate.value = dateStr
}
function fmtHour(h: number) {
  return `${h.toString().padStart(2, '0')}:00`
}
function addSlot() {
  const start = fmtHour(addSlotStart.value)
  const end = fmtHour(addSlotEnd.value)
  if (addSlotEnd.value <= addSlotStart.value) return
  slotsForSelectedDate.value = [...slotsForSelectedDate.value, { start, end }]
}
function removeSlot(index: number) {
  slotsForSelectedDate.value = slotsForSelectedDate.value.filter((_, i) => i !== index)
}
async function saveSlots() {
  if (!availabilityDate.value) return
  savingSlots.value = true
  try {
    await setSlotsForDate(availabilityDate.value, slotsForSelectedDate.value, 'inge')
  } finally {
    savingSlots.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="pds-h2">Mes indisponibilités</h2>
    <div class="pds-card space-y-4">
      <p class="text-sm text-[var(--pds-muted)]">
        Tu es considéré disponible à tout moment sauf aux créneaux ci-dessous. Choisis une date puis
        ajoute les créneaux où tu n’es pas dispo (ex. 10h–14h).
      </p>
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
          @click="prevAvailabilityMonth"
        >
          ‹
        </button>
        <span class="font-medium text-[var(--pds-text)]">{{ availabilityMonthLabel }}</span>
        <button
          type="button"
          class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
          @click="nextAvailabilityMonth"
        >
          ›
        </button>
      </div>
      <div class="grid grid-cols-7 gap-1 sm:gap-2">
        <div
          v-for="(lab, di) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']"
          :key="di"
          class="text-center text-xs text-[var(--pds-muted)]"
        >
          {{ lab }}
        </div>
        <button
          v-for="(cell, idx) in availabilityCalendarDays"
          :key="idx"
          type="button"
          class="flex aspect-square items-center justify-center rounded-lg border text-sm transition-colors"
          :class="{
            'border-transparent bg-transparent': cell.day == null,
            'cursor-not-allowed opacity-40': cell.disabled && cell.day != null,
            'border-[var(--pds-primary)] bg-[var(--pds-primary)] text-white':
              availabilityDate === cell.dateStr,
            'border-[var(--pds-border)] bg-[var(--pds-bg)] hover:border-[var(--pds-primary)]':
              cell.day != null && !cell.disabled && availabilityDate !== cell.dateStr,
          }"
          :disabled="cell.day == null || cell.disabled"
          @click="selectAvailabilityDate(cell.dateStr)"
        >
          {{ cell.day ?? '' }}
        </button>
      </div>
      <div v-if="availabilityDate" class="border-t border-[var(--pds-border)] pt-4">
        <p class="mb-2 text-sm text-[var(--pds-text)]">
          Créneaux d’indisponibilité le {{ availabilityDate }}
        </p>
        <div v-if="loadingSlots" class="text-sm text-[var(--pds-muted)]">Chargement...</div>
        <template v-else>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <select v-model.number="addSlotStart" class="pds-input w-20">
              <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}h</option>
            </select>
            <span>→</span>
            <select v-model.number="addSlotEnd" class="pds-input w-20">
              <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}h</option>
            </select>
            <button type="button" class="btn-primary !py-2 !px-3 !text-sm" @click="addSlot">
              Ajouter un créneau indispo
            </button>
          </div>
          <ul class="mb-3 space-y-2">
            <li
              v-for="(slot, i) in slotsForSelectedDate"
              :key="i"
              class="flex items-center justify-between rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2 text-sm"
            >
              <span>{{ slot.start }} – {{ slot.end }}</span>
              <button type="button" class="text-red-400 hover:underline" @click="removeSlot(i)">
                Supprimer
              </button>
            </li>
          </ul>
          <button
            type="button"
            class="btn-primary !py-2 !px-3 !text-sm"
            :disabled="savingSlots"
            @click="saveSlots"
          >
            {{ savingSlots ? 'Enregistrement...' : 'Enregistrer les indisponibilités' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
