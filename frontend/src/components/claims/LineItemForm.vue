<script setup lang="ts">
import { computed, reactive, useId } from 'vue'
import { fieldErrorsOf } from '@/api/errors'
import type { LineItemInput } from '@/api/claims'
import BaseButton from '@/components/BaseButton.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import type { Category, LineItem } from '@/types/api'
import { enumLabel, todayIsoDate } from '@/utils/format'

// item = edit mode (prefilled); no item = add mode. The parent does the API call and passes back saving/error.
const {
  item,
  saving = false,
  error = null,
} = defineProps<{
  item?: LineItem
  saving?: boolean
  error?: unknown
}>()
const emit = defineEmits<{ submit: [values: LineItemInput]; cancel: [] }>()

const CATEGORIES: Category[] = [
  'TRAVEL',
  'ACCOMMODATION',
  'MEALS',
  'TRANSPORT',
  'OFFICE_SUPPLIES',
  'OTHER',
]

// Local copy of the fields, so typing does not change the saved item until the server accepts it
const form = reactive<LineItemInput>({
  date: item?.date ?? todayIsoDate(),
  category: item?.category ?? 'TRAVEL',
  amount: item?.amount ?? '',
  description: item?.description ?? '',
})

// Server validation messages per field (400 VALIDATION_ERROR details)
const fieldErrors = computed(() => fieldErrorsOf(error))
// Anything that is not a field error is shown as a banner
const generalError = computed(() => {
  const hasFieldErrors = Object.keys(fieldErrors.value).length > 0
  return hasFieldErrors ? null : error
})

// Unique ids link each label to its input (several forms can be open at once)
const uid = useId()

const inputClass =
  'block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none'

function onSubmit(): void {
  emit('submit', { ...form, description: form.description.trim() })
}
</script>

<template>
  <form
    class="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"
    @submit.prevent="onSubmit"
  >
    <ErrorAlert :error="generalError" />

    <div class="grid gap-3 sm:grid-cols-3">
      <div>
        <label :for="`${uid}-date`" class="mb-1 block text-xs font-medium text-slate-600"
          >Date</label
        >
        <input
          :id="`${uid}-date`"
          v-model="form.date"
          type="date"
          required
          :max="todayIsoDate()"
          :class="inputClass"
        />
        <p v-if="fieldErrors.date" class="mt-1 text-xs text-red-600">{{ fieldErrors.date }}</p>
      </div>

      <div>
        <label :for="`${uid}-category`" class="mb-1 block text-xs font-medium text-slate-600"
          >Category</label
        >
        <select :id="`${uid}-category`" v-model="form.category" required :class="inputClass">
          <option v-for="category in CATEGORIES" :key="category" :value="category">
            {{ enumLabel(category) }}
          </option>
        </select>
        <p v-if="fieldErrors.category" class="mt-1 text-xs text-red-600">
          {{ fieldErrors.category }}
        </p>
      </div>

      <!-- Amount is text, not a number input: the value is sent as typed, never converted to a float -->
      <div>
        <label :for="`${uid}-amount`" class="mb-1 block text-xs font-medium text-slate-600"
          >Amount (₹)</label
        >
        <input
          :id="`${uid}-amount`"
          v-model="form.amount"
          type="text"
          inputmode="decimal"
          required
          pattern="\d{1,10}(\.\d{1,2})?"
          title="A positive amount with at most 2 decimals, e.g. 1250.50"
          placeholder="0.00"
          :class="inputClass"
        />
        <p v-if="fieldErrors.amount" class="mt-1 text-xs text-red-600">{{ fieldErrors.amount }}</p>
      </div>
    </div>

    <div>
      <label :for="`${uid}-description`" class="mb-1 block text-xs font-medium text-slate-600"
        >Description</label
      >
      <input
        :id="`${uid}-description`"
        v-model="form.description"
        type="text"
        required
        maxlength="500"
        placeholder="e.g. Taxi from airport to client office"
        :class="inputClass"
      />
      <p v-if="fieldErrors.description" class="mt-1 text-xs text-red-600">
        {{ fieldErrors.description }}
      </p>
    </div>

    <div class="flex justify-end gap-2">
      <BaseButton variant="secondary" :disabled="saving" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton type="submit" :loading="saving">{{ item ? 'Save item' : 'Add item' }}</BaseButton>
    </div>
  </form>
</template>
