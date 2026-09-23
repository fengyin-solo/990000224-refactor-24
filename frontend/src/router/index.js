import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { isTokenUsable } from '../utils/session'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/article/:id',
    name: 'ArticleDetail',
    component: () => import('../views/ArticleDetail.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/admin',
    name: 'Dashboard',
    component: () => import('../views/admin/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/articles',
    name: 'AdminArticleList',
    component: () => import('../views/admin/ArticleList.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/articles/new',
    name: 'ArticleCreate',
    component: () => import('../views/admin/ArticleEditor.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/articles/:id/edit',
    name: 'ArticleEdit',
    component: () => import('../views/admin/ArticleEditor.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard for auth
// 与拦截器共用同一判定：无令牌或令牌已过期都不允许进入受保护页
// （store 初始化时已清掉过期令牌，这里再兜底一次，保证重开页面也不会放行）
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth) {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn || !isTokenUsable(authStore.token)) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router
