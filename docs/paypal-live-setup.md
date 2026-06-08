# PayPal Live — corriger l’erreur 401 `invalid_client`

L’erreur **`401 invalid_client`** signifie que PayPal refuse la paire **Client ID + Secret**.  
En mode **live**, ce n’est **pas** le même compte que le sandbox : il faut des identifiants **Live** distincts.

## Checklist (dans l’ordre)

### 1. Récupérer les identifiants **Live** (pas sandbox)

1. [developer.paypal.com](https://developer.paypal.com/dashboard/) → en haut à droite, passer de **Sandbox** à **Live**
2. **Apps & Credentials** → ton app (ou **Create App**)
3. Copier le **Client ID Live**
4. **Show** sous **Secret** → copier le **Secret Live** (ou **Regenerate** si doute)

⚠️ Le Client ID sandbox (`AfRN-…` etc.) **ne fonctionne pas** avec `PAYPAL_MODE=live`.

### 2. Variables Netlify (scope **Production**)

| Variable | Valeur |
|----------|--------|
| `NUXT_PUBLIC_PAYPAL_CLIENT_ID` | Client ID **Live** |
| `PAYPAL_CLIENT_SECRET` | Secret **Live** (même app) |
| `NUXT_PAYPAL_CLIENT_SECRET` | Idem (recommandé) |
| `PAYPAL_MODE` | `live` |

Pas d’espaces avant/après. Le secret ne doit **jamais** être en `NUXT_PUBLIC_*`.

### 3. Redéployer

Après changement de `NUXT_PUBLIC_PAYPAL_CLIENT_ID`, lancer un **nouveau deploy** (Clear cache and deploy site).  
Le Client ID public est intégré au build du site.

### 4. Compte Business PayPal

Le compte PayPal Business lié à l’app doit être **vérifié** et autorisé à accepter les paiements en production.

### 5. Tester les identifiants en local

```bash
# PowerShell
$env:NUXT_PUBLIC_PAYPAL_CLIENT_ID="ton_client_id_live"
$env:PAYPAL_CLIENT_SECRET="ton_secret_live"
$env:PAYPAL_MODE="live"
node scripts/test-paypal-credentials.mjs
```

Résultat attendu : `Token PayPal LIVE: OK`.

## Erreurs fréquentes

| Erreur | Cause |
|--------|--------|
| Client ID sandbox + `PAYPAL_MODE=live` | Mettre les identifiants Live ou repasser en `sandbox` |
| Secret d’une autre app | Client ID et Secret doivent venir de la **même** app Live |
| Ancien secret après régénération | Mettre à jour Netlify + redéployer |
| Variables seulement en Preview, pas Production | Dupliquer les vars pour le contexte **Production** |

## Rester en sandbox (tests)

Tant que le site n’est pas prêt pour de vrais paiements :

```
PAYPAL_MODE=sandbox
NUXT_PUBLIC_PAYPAL_CLIENT_ID=<client sandbox>
PAYPAL_CLIENT_SECRET=<secret sandbox>
```
