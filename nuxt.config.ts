import { defineNuxtConfig } from 'nuxt/config'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['shadcn-nuxt'],
  experimental: {
    serverAppConfig: false,
  },
  devtools: {
    enabled: true,
  },
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },
  devServer: {
    host: '0.0.0.0',
    port: 3001,
  },
  srcDir: 'app/',
  css: ['~/assets/css/main.css'],
  vite: {
    optimizeDeps: {
      include: ['@vueuse/core', 'lucide-vue-next', 'reka-ui'],
    },
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    dbFileName: process.env.DB_FILE_NAME ?? 'file:./data/beak-control-pane.db',
    /** Session cookie name for auth */
    authCookieName: process.env.AUTH_COOKIE_NAME ?? 'bcp_session',
    authSessionDays: Number(process.env.AUTH_SESSION_DAYS ?? '14') || 14,
    /** When true, `/api/*` staff routes require platform_staff session (see server handlers). */
    authEnforceApi: process.env.AUTH_ENFORCE_API
      ? process.env.AUTH_ENFORCE_API === 'true'
      : process.env.NODE_ENV === 'production',
    public: {
      /** When true, redirect unauthenticated users away from the staff console UI. */
      authEnforceConsole: process.env.AUTH_ENFORCE_CONSOLE
        ? process.env.AUTH_ENFORCE_CONSOLE === 'true'
        : process.env.NODE_ENV === 'production',
      /** When true, redirect unauthenticated users away from `/portal/*` (except login/signup). */
      authEnforcePortal: process.env.AUTH_ENFORCE_PORTAL
        ? process.env.AUTH_ENFORCE_PORTAL === 'true'
        : process.env.NODE_ENV === 'production',
    },
  },
  /** Activations are managed per license; old standalone routes redirect to Licenses. */
  routeRules: {
    '/activations': { redirect: '/licenses' },
    '/activations/**': { redirect: '/licenses' },
  },
  nitro: {
    experimental: {
      tasks: true,
    },
    /** Hourly usage recalculation (node-server and compatible hosts). */
    scheduledTasks: {
      '0 * * * *': ['usage:recalculate'],
    },
    routeRules: {
      '/api/billing/stripe/webhook': {
        bodyParser: false,
      },
    },
  },
} as any)
