# Créneaux sans connexion — déploiement Firestore OBLIGATOIRE

Le code en ligne **ne suffit pas** : il faut **publier les règles Firestore** sur le même projet Firebase que la prod.

Sans ça, les invités ne peuvent pas lire les ingés ni les disponibilités → **aucun créneau** sur le calendrier.

## Déployer depuis le projet

```bash
firebase login
firebase use VOTRE_PROJECT_ID
firebase deploy --only firestore:rules
```

Le fichier `firestore.rules` à la racine du repo contient les règles PDS.  
Si vous utilisez aussi **ComptaIBE** (`ibe_apps/...`), **fusionnez** les blocs ci-dessous dans votre fichier Firebase Console au lieu d’écraser tout le projet.

## 3 modifications dans la console Firebase (Rules)

### 1. `match /users/{userId}` — lecture

Remplacez la ligne `allow read` par :

```javascript
allow read: if isSignedIn()
  || resource.data.role in ['inge', 'beatmaker'];
```

### 2. `match /availability/{docId}` — lecture

```javascript
allow read: if true;
```

### 3. `match /sessions/{sessionId}` — lecture

Ajoutez à la condition `allow read` (en plus du reste) :

```javascript
|| resource.data.status in ['waiting_payment', 'pending', 'confirmed']
```

Puis **Publier** les règles.

## Index Firestore (après déploiement du code)

Si le calendrier affiche une erreur d’index, créez l’index composite demandé dans la console (lien dans F12 → Console) :

- Collection `sessions`
- Champs : `date` (Ascending), `status` (Ascending)

## Vérification rapide

1. Ouvre `/reserver` en **navigation privée** (non connecté).
2. Choisis une **durée** (ex. 2 h).
3. Des cases vertes / cliquables doivent apparaître sur les jours où un ingé a des dispos.

Si rien n’apparaît : F12 → onglet **Console** → erreur `permission-denied` = règles pas encore déployées.
