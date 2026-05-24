# Créneaux invités — règles Firestore

## Cause

Sans connexion, le booker charge :

1. `users` (liste des ingés) → `allow read: if isSignedIn()` ❌
2. `availability` (dispos ingés) → `allow read: if isSignedIn()` ❌
3. `sessions` (créneaux déjà réservés) → lecture réservée aux connectés ❌

Résultat : listes vides, aucun créneau affiché.

## Correctifs à appliquer dans la console Firebase

Remplacez **uniquement** les blocs `users`, `sessions` et `availability` par ceux ci-dessous (gardez `ibe_apps`, `beats`, `sessionFiles`, `ingeInvites`, catch-all, etc.).

### `users`

```javascript
allow read: if isSignedIn()
  || resource.data.role in ['inge', 'beatmaker'];
```

### `availability`

```javascript
allow read: if true;
```

(L’écriture reste réservée aux ingés/beatmakers connectés.)

### `sessions` — ajouter à la condition `allow read`

```javascript
|| resource.data.status in ['waiting_payment', 'pending', 'confirmed']
```

Exemple complet :

```javascript
allow read: if isAdmin()
  || (isSignedIn() && resource.data.bookerId == request.auth.uid)
  || isInge()
  || isBeatmaker()
  || isBooker()
  || resource.data.status in ['waiting_payment', 'pending', 'confirmed'];
```

### Paiement PayPal invité (optionnel si capture côté client)

```javascript
function isPaypalDepositUpdate() {
  return resource.data.status == 'waiting_payment'
    && request.resource.data.status == 'pending'
    && request.resource.data.paypalOrderId is string
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'paypalOrderId']);
}

// Dans allow update:
|| isPaypalDepositUpdate()
```

Puis `firebase deploy --only firestore:rules`.
