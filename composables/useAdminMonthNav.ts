import { computed, ref } from 'vue'
import { monthLabelFr, monthRangeIso } from '../utils/adminMonth'

export function useAdminMonthNav() {
  const now = new Date()
  const year = ref(now.getFullYear())
  const month = ref(now.getMonth())

  const label = computed(() => monthLabelFr(year.value, month.value))
  const range = computed(() => monthRangeIso(year.value, month.value))

  function prevMonth() {
    const d = new Date(year.value, month.value - 1, 1)
    year.value = d.getFullYear()
    month.value = d.getMonth()
  }

  function nextMonth() {
    const d = new Date(year.value, month.value + 1, 1)
    year.value = d.getFullYear()
    month.value = d.getMonth()
  }

  return { year, month, label, range, prevMonth, nextMonth }
}
