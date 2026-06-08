// https://nuxt.com/docs/api/configuration/nuxt-config
import { loadProjectEnv } from './server/utils/loadEnvFile'

// Garantit que les longues vars (ex. GOOGLE_SERVICE_ACCOUNT_JSON) sont dans process.env avant runtimeConfig
loadProjectEnv()

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],

  /** Netlify : build avec fonctions serverless pour /api/* (PayPal, Firebase Admin). */
  nitro: {
    preset: process.env.NITRO_PRESET || undefined,
  },
  css: ['~~/assets/css/main.css'],
  app: {
    head: {
      title: "PDS — Studio d'enregistrement",
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;700;800&display=swap',
        },
      ],
    },
  },

  runtimeConfig: {
    public: {
      firebaseApiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID,

      paypalClientId: process.env.NUXT_PUBLIC_PAYPAL_CLIENT_ID,
      paypalMode: process.env.PAYPAL_MODE || 'sandbox',
      /** Email et téléphone admin pour afficher dans le client (notifications) */
      adminNotifyEmail: process.env.NUXT_PUBLIC_ADMIN_NOTIFY_EMAIL || '',
      adminNotifyPhone: process.env.NUXT_PUBLIC_ADMIN_NOTIFY_PHONE || '',
    },
    /** Clés privées (serveur uniquement) pour envoi mail / SMS */
    resendApiKey: process.env.RESEND_API_KEY || '',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioFromPhone: process.env.TWILIO_FROM_PHONE || '',
    twilioServiceSid: process.env.TWILIO_SERVICE_SID || '',
    adminEmail: process.env.ADMIN_EMAIL || process.env.NUXT_PUBLIC_ADMIN_NOTIFY_EMAIL || '',
    adminPhone: process.env.ADMIN_PHONE || process.env.NUXT_PUBLIC_ADMIN_NOTIFY_PHONE || '',
    /** Secret PayPal (capture serveur) — ne jamais exposer côté client */
    paypalClientSecret:
      process.env.NUXT_PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET || '',
    /** sandbox | live (défaut sandbox) */
    paypalMode: process.env.PAYPAL_MODE || 'sandbox',
    /** Google Calendar (Service Account) : chemin vers le JSON de clé OU email + clé privée */
    /** Ne pas y stocker le JSON (trop long, tronqué par Nitro) — lu via process.env / .env à la requête. */
    googleServiceAccountJson: '',
    googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    googleServiceAccountEmail:
      process.env.NUXT_GOOGLE_SERVICE_ACCOUNT_EMAIL ||
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
      '',
    googleServiceAccountPrivateKey:
      process.env.NUXT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
      '',
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  },
})
