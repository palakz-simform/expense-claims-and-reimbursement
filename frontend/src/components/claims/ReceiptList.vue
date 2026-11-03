<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  PaperClipIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import {
  deleteReceipt,
  downloadReceipt,
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  RECEIPTS_PER_ITEM,
  uploadReceipt,
} from '@/api/receipts'
import ErrorAlert from '@/components/ErrorAlert.vue'
import type { Receipt } from '@/types/api'
import { saveBlob } from '@/utils/download'

// editable = upload and delete allowed (the claim is not approved)
const { lineItemId, receipts, editable } = defineProps<{
  lineItemId: string
  receipts: Receipt[]
  editable: boolean
}>()
// The parent reloads the claim after an upload or delete
const emit = defineEmits<{ changed: [] }>()

const uploading = ref(false)
const deletingId = ref<string | null>(null)
const error = ref<unknown>(null)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

// "52 KB", "1.4 MB"
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Upload the chosen file. Type and size are checked here for quick feedback; the backend checks again.
async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  error.value = null
  if (!RECEIPT_TYPES.includes(file.type)) {
    error.value = 'Only PDF, PNG or JPEG files can be uploaded.'
    return
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    error.value = 'The file is larger than 5 MB.'
    return
  }

  uploading.value = true
  try {
    await uploadReceipt(lineItemId, file)
    emit('changed')
  } catch (uploadError) {
    error.value = uploadError
  } finally {
    uploading.value = false
  }
}

// Fetch the file with the auth header, then save it under its original name
async function onDownload(receipt: Receipt): Promise<void> {
  error.value = null
  try {
    const blob = await downloadReceipt(receipt.id)
    saveBlob(blob, receipt.originalName)
  } catch (downloadError) {
    error.value = downloadError
  }
}

async function onDelete(receipt: Receipt): Promise<void> {
  error.value = null
  deletingId.value = receipt.id
  try {
    await deleteReceipt(receipt.id)
    emit('changed')
  } catch (deleteError) {
    error.value = deleteError
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="space-y-2">
    <!-- Receipt chips: name, size, download, delete -->
    <ul v-if="receipts.length > 0" class="flex flex-wrap gap-2">
      <li
        v-for="receipt in receipts"
        :key="receipt.id"
        class="flex items-center gap-1.5 rounded-lg bg-white py-1 pr-1 pl-2 text-xs ring-1 ring-slate-200"
      >
        <PaperClipIcon class="size-3.5 text-slate-400" />
        <span class="max-w-40 truncate font-medium text-slate-700" :title="receipt.originalName">
          {{ receipt.originalName }}
        </span>
        <span class="text-slate-400">{{ formatSize(receipt.sizeBytes) }}</span>
        <button
          type="button"
          class="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
          :aria-label="`Download ${receipt.originalName}`"
          @click="onDownload(receipt)"
        >
          <ArrowDownTrayIcon class="size-3.5" />
        </button>
        <button
          v-if="editable"
          type="button"
          :disabled="deletingId === receipt.id"
          class="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          :aria-label="`Delete ${receipt.originalName}`"
          @click="onDelete(receipt)"
        >
          <XMarkIcon class="size-3.5" />
        </button>
      </li>
    </ul>

    <!-- Upload (hidden file input opened by the button), up to 5 per item -->
    <div v-if="editable && receipts.length < RECEIPTS_PER_ITEM">
      <input
        ref="fileInput"
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        class="hidden"
        @change="onFileChosen"
      />
      <button
        type="button"
        :disabled="uploading"
        class="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
        @click="fileInput?.click()"
      >
        <ArrowUpTrayIcon class="size-3.5" />
        {{ uploading ? 'Uploading…' : 'Attach receipt' }}
      </button>
      <span class="ml-2 text-xs text-slate-400">PDF, PNG or JPEG · max 5 MB</span>
    </div>

    <ErrorAlert :error="error" />
  </div>
</template>
