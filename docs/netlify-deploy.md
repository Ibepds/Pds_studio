# Déploiement Netlify (PayPal + Firebase Admin)

Sur Netlify, le site est statique **mais** les routes `/api/*` tournent en **fonctions serverless** (preset Nitro `netlify`).  
PayPal et Firebase Admin fonctionnent **à condition de configurer les variables d’environnement** dans le dashboard Netlify (le fichier `.env` local n’est pas déployé).

## 1. Build

Le repo contient `netlify.toml` :

- `npm run build` avec `NITRO_PRESET=netlify`
- publication du dossier `dist`

Branche de prod : connecter le repo Git sur [Netlify](https://app.netlify.com/) → le build se lance automatiquement.

## 2. Variables d’environnement (Site settings → Environment variables)

Copier **toutes** les variables utiles depuis ton `.env` local, puis ajuster pour la prod.

### Firebase (client — publiques)

| Variable | Scope |
|----------|--------|
| `NUXT_PUBLIC_FIREBASE_API_KEY` | All |
| `NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | All |
| `NUXT_PUBLIC_FIREBASE_PROJECT_ID` | All |
| `NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | All |
| `NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | All |
| `NUXT_PUBLIC_FIREBASE_APP_ID` | All |

### PayPal

| Variable | Scope | Notes |
|----------|--------|--------|
| `NUXT_PUBLIC_PAYPAL_CLIENT_ID` | All | Client ID (sandbox ou live) |
| `PAYPAL_CLIENT_SECRET` | All | Secret REST — **jamais** `NUXT_PUBLIC_*` |
| `NUXT_PAYPAL_CLIENT_SECRET` | All | Recommandé sur Netlify (lu au runtime) |
| `PAYPAL_MODE` | All | `sandbox` ou `live` — **doit correspondre** au Client ID |

### Firebase Admin (serveur — obligatoire pour create-order / capture-order)

| Variable | Valeur |
|----------|--------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON du compte de service Firebase, **minifié sur une ligne** |

Alternatives : `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

### Notifications / Calendar (optionnel)

`RESEND_API_KEY`, `TWILIO_*`, `ADMIN_EMAIL`, `GOOGLE_CALENDAR_ID`, etc.

## 3. Erreur 502 sur `/api/paypal/create-order`

Un **502** signifie presque toujours un échec de l’**API PayPal** (pas Firebase). Causes fréquentes :

| Cause | Solution |
|--------|----------|
| `PAYPAL_MODE=live` avec un Client ID **sandbox** | Mettre `PAYPAL_MODE=sandbox` ou passer aux identifiants **Live** PayPal |
| Secret absent au **runtime** Netlify | Ajouter `PAYPAL_CLIENT_SECRET` ou `NUXT_PAYPAL_CLIENT_SECRET` → **Production** → redéployer |
| Secret d’une autre app PayPal | Recopier le secret depuis la **même** app que le Client ID |
| App PayPal sans « Accept payments » | Activer **Accept Payments** sur l’app REST PayPal |

### Logs Netlify (Functions)

- `[PDS PayPal] create-order → début` → vérifier `mode: "sandbox"` ou `"live"`
- `[PDS PayPal] oauth2 token échec` → identifiants ou mode incorrect
- `[PDS PayPal] create-order session Firestore` → Firebase OK, problème PayPal ensuite

## 4. PayPal en production

- Site public : app PayPal **Live**, `PAYPAL_MODE=live`, Client ID + secret Live sur Netlify.
- Tests : `PAYPAL_MODE=sandbox` + identifiants sandbox.

## 5. Firestore

Déployer les règles Firebase séparément (`firestore.rules`, `docs/firestore-rules-guest-slots.md`).

## 6. Vérifier après déploiement

1. Réserver → payer sur le site Netlify.
2. Console navigateur : `[PDS PayPal] create-order ← réponse` avec `orderId`.
3. Erreur 503 : revoir `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. Erreur 502 : revoir PayPal (section 3).

```bash
node scripts/test-firebase-admin.mjs
```

## 7. Contextes Netlify

- **Production** : variables live si site public.
- **Deploy Preview** : sandbox recommandé.
