import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'

// Pages are lazy-loaded: each becomes its own small JS chunk, fetched on first visit
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    // Signed-in pages share the layout (top bar + content area)
    {
      path: '/',
      component: AppLayout,
      children: [
        // "/" sends each role to its own home page
        { path: '', name: 'home', redirect: () => useAuthStore().homePath },
        {
          path: 'claims',
          name: 'claims',
          component: () => import('@/views/claimant/ClaimsListView.vue'),
        },
        {
          path: 'approvals',
          name: 'approvals',
          component: () => import('@/views/approver/ApprovalQueueView.vue'),
        },
        {
          path: 'finance',
          name: 'finance',
          component: () => import('@/views/finance/FinanceClaimsView.vue'),
        },
      ],
    },
  ],
})

export default router
