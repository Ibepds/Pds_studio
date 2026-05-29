# Déploiement Netlify (PayPal + Firebase Admin)

Sur Netlify, le site est statique **mais** les routes `/api/*` tournent en **fonctions serverless** (preset Nitro `netlify`).  
PayPal et Firebase Admin fonctionnent donc **à condition de configurer les variables d’environnement** dans le dashboard Netlify (le fichier `.env` local n’est pas déployé).

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
| `PAYPAL_MODE` | All | `sandbox` ou `live` (aligné avec le client ID) |

### Firebase Admin (serveur — **obligatoire pour create-order / capture-order**)

**Recommandé sur Netlify** : une seule variable avec le JSON du compte de service (téléchargé depuis Firebase → Paramètres → Comptes de service → Générer une nouvelle clé privée).

| Variable | Valeur |
|----------|--------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Coller le JSON **minifié sur une seule ligne** (sans retours à la ligne dans la clé `private_key` — le fichier téléchargé convient tel quel si tu le minifies) |

Exemple de forme (tronqué) :

```json
{"type":"service_account","project_id":"studio-booking-804ff","private_key_id":"…","private_key":"-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxx@studio-booking-804ff.iam.gserviceaccount.com",…}
```

**Ne pas** utiliser `GOOGLE_APPLICATION_CREDENTIALS=./secrets/…` sur Netlify : le fichier JSON n’est pas présent sur les fonctions serverless.

Alternatives (si tu préfères) :

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (clé avec `\n` dans la valeur)
- Clé privée seule en base64 (sans en-tête PEM) : acceptée par le parseur

### Notifications (si utilisées)

`RESEND_API_KEY`, `TWILIO_*`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `NUXT_PUBLIC_ADMIN_NOTIFY_*`, etc.

### Google Calendar (optionnel)

Même compte de service ou un autre ; `GOOGLE_CALENDAR_ID`.

## 3. PayPal en production

- Créer une app **Live** dans le dashboard PayPal si le site est public.
- Mettre `PAYPAL_MODE=live` et les identifiants **live** sur Netlify.
- Garder `sandbox` uniquement pour un site de preview / tests.

## 4. Firestore

Les règles Firestore doivent être déployées sur le projet Firebase (voir `firestore.rules` et `docs/firestore-rules-guest-slots.md`).  
Le déploiement Netlify ne déploie **pas** les règles Firebase.

## 5. Vérifier après déploiement

1. Ouvrir le site Netlify → réserver → payer.
2. Console navigateur : filtre `[PDS PayPal]` → `create-order ← réponse` avec `orderId`.
3. Si erreur 503 Firebase : revoir `GOOGLE_SERVICE_ACCOUNT_JSON` (mauvais projet, JSON tronqué, ou clé révoquée).

En local, tester les identifiants :

```bash
node scripts/test-firebase-admin.mjs
```

(Avec `GOOGLE_SERVICE_ACCOUNT_JSON` ou fichier dans `.env`.)

## 6. Contextes Netlify (Production vs Deploy Preview)

- **Production** : variables live (PayPal live, etc.).
- **Deploy Preview** : dupliquer les variables ou utiliser un contexte `deploy-preview` avec `PAYPAL_MODE=sandbox`.
