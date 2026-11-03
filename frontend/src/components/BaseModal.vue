<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

// v-model:open from the parent; title shown at the top
const open = defineModel<boolean>('open', { required: true })
defineProps<{ title: string }>()

// Native <dialog>: showModal() gives focus trapping, Esc to close and a backdrop for free
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(open, (isOpen) => {
  if (isOpen) {
    dialog.value?.showModal()
  } else {
    dialog.value?.close()
  }
})

// A click on the backdrop lands on the <dialog> element itself, not on its content
function onDialogClick(event: MouseEvent): void {
  if (event.target === dialog.value) {
    open.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-full max-w-md rounded-2xl bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    @close="open = false"
    @click="onDialogClick"
  >
    <div class="p-6">
      <h2 class="text-lg font-semibold text-slate-900">{{ title }}</h2>
      <div class="mt-4">
        <slot />
      </div>
    </div>
  </dialog>
</template>
