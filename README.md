# Vinylthèque

Catalogue de collection de vinyles : **deux photos par disque** (recto / verso) et **remplissage automatique des titres**.

## Fonctionnalités

- Compte utilisateur (email + mot de passe), chaque collection appartient à son compte
- Site public : la collection est consultable sur `/u/<nom-utilisateur>` (désactivable)
- Deux photos par vinyle (recto = pochette, verso = liste des titres), redimensionnées et stockées en base
- Titres remplis automatiquement :
  1. **Lecture de la photo (OCR)** — Tesseract.js s'exécute dans le navigateur sur la photo du verso
  2. **MusicBrainz** — complète artiste, année, label et tracklist à partir du nom du disque
- Champs : nom, artiste, année, label, notes, titres
- Recherche instantanée dans toute la collection

## Stack

Node 20+ / Express · PostgreSQL · Tesseract.js (côté navigateur) · sharp · JWT en cookie httpOnly

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (fournie par Railway) |
| `JWT_SECRET` | Secret pour signer les sessions (chaîne aléatoire longue) |
| `NODE_ENV` | `production` en ligne |
| `PORT` | Fourni automatiquement par Railway |

## Lancer en local

```bash
npm install
export DATABASE_URL="postgres://user:pass@localhost:5432/vinyltheque"
export JWT_SECRET="dev-secret"
npm start
```

## Déploiement Railway

1. Nouveau projet → *Deploy from GitHub repo*
2. Ajouter le service **PostgreSQL** ; `DATABASE_URL` est injecté automatiquement
3. Définir `JWT_SECRET` et `NODE_ENV=production`
4. *Settings → Networking → Generate Domain*

Le schéma de la base est créé automatiquement au démarrage.
