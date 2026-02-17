// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~~/assets/css/main.css'],
  app: {
    head: {
      title: 'PDS — Studio d\'enregistrement',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
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

      /** Email et téléphone admin pour afficher dans le client (notifications) */
      adminNotifyEmail: process.env.NUXT_PUBLIC_ADMIN_NOTIFY_EMAIL || '',
      adminNotifyPhone: process.env.NUXT_PUBLIC_ADMIN_NOTIFY_PHONE || '',
    },
    /** Clés privées (serveur uniquement) pour envoi mail / SMS */
    resendApiKey: process.env.RESEND_API_KEY || '',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioFromPhone: process.env.TWILIO_FROM_PHONE || '',
    adminEmail: process.env.ADMIN_EMAIL || process.env.NUXT_PUBLIC_ADMIN_NOTIFY_EMAIL || '',
    adminPhone: process.env.ADMIN_PHONE || process.env.NUXT_PUBLIC_ADMIN_NOTIFY_PHONE || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  },
})
