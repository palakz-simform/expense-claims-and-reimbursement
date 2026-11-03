import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/api'

// Typed route meta: public pages skip the login check, roles limit who may open a page
declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    roles?: Role[]
  }
}

// Pages are lazy-loaded: each becomes its own small JS chunk, fetched on first visit
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
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
          meta: { roles: ['CLAIMANT'] },
        },
        // props: true passes the :id param to the page as a prop
        {
          path: 'claims/:id/edit',
          name: 'claim-edit',
          component: () => import('@/views/claimant/ClaimEditorView.vue'),
          props: true,
          meta: { roles: ['CLAIMANT'] },
        },
        // Read-only claim page for every role (the API decides which claims each user may see)
        {
          path: 'claims/:id',
          name: 'claim-detail',
          component: () => import('@/views/claims/ClaimDetailView.vue'),
          props: true,
          meta: { roles: ['CLAIMANT', 'APPROVER', 'FINANCE'] },
        },
        {
          path: 'approvals',
          name: 'approvals',
          component: () => import('@/views/approver/ApprovalQueueView.vue'),
          meta: { roles: ['APPROVER'] },
        },
        // Not under /approvals: the nav highlights by path prefix, so both links would light up
        {
          path: 'reviewed',
          name: 'reviewed',
          component: () => import('@/views/approver/ReviewedClaimsView.vue'),
          meta: { roles: ['APPROVER'] },
        },
        {
          path: 'finance',
          name: 'finance',
          component: () => import('@/views/finance/FinanceClaimsView.vue'),
          meta: { roles: ['FINANCE'] },
        },
      ],
    },
    // Anything else: 404 page
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true },
    },
  ],
})

// Restore the session only once per page load (the token survives a refresh, the user object does not)
let sessionRestored = false

// Runs before every navigation; the return value allows it (true) or redirects
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!sessionRestored) {
    sessionRestored = true
    await auth.loadMe()
  }

  // Public pages; a signed-in user opening /login goes to their home page instead
  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated) {
      return auth.homePath
    }
    return true
  }

  // Not signed in: login first, then come back here
  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Wrong role: back to their own home page (the API would refuse anyway)
  const allowedRoles = to.meta.roles
  if (allowedRoles && !auth.hasRole(...allowedRoles)) {
    return auth.homePath
  }

  return true
})

export default router
