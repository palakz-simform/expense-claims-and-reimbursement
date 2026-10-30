<template>
  <!-- Shown for any URL that matches no route -->
  <main class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
    <div class="text-center">
      <p class="text-sm font-semibold text-indigo-600">404</p>
      <h1 class="mt-2 text-3xl font-semibold text-slate-900">Page not found</h1>
      <p class="mt-2 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <RouterLink
        to="/"
        class="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
      >
        Go to home
      </RouterLink>
    </div>
  </main>
</template>
