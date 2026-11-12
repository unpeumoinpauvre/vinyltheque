# Vinylthèque

Catalogue de collection de vinyles : **deux photos par disque** (recto / verso) et **remplissage automatique des titres**.

## Fonctionnalités

- Compte utilisateur (email + mot de passe), chaque collection appartient à son compte
- Site public : la collection est consultable sur `/u/<nom-utilisateur>` (désactivable)
- Deux photos par vinyle (recto = pochette, verso = liste des titres), redimensionnées et stockées en base
- **Recadrage automatique** sur la pochette : le contour de la photo (table, mur, doigts) est détecté par l'énergie des contours et retiré ; désactivable au cas par cas
- **Métadonnées supprimées** : la photo est ré-encodée dans le navigateur *avant* l'envoi (EXIF, GPS, appareil, date, IPTC, XMP, vignette), puis à nouveau côté serveur par sharp. L'orientation EXIF est appliquée à l'image avant suppression.
- Titres remplis automatiquement, **face par face** (voir « Lecture des pochettes » plus bas) : les deux photos sont lues par une IA ; sans clé d'API ou en cas de panne, par Tesseract.js dans le navigateur
- Champs : nom, artiste, année, label, notes, titres
- Recherche instantanée dans toute la collection, **par album ou par morceau** (« sur quel disque est ce titre ? »)
- **E-mails via Resend** : confirmation d'adresse à l'inscription, mot de passe oublié, avis de changement de mot de passe. Les jetons sont stockés hachés (SHA-256), valables 48 h (confirmation) et 1 h (réinitialisation), à usage unique. `/api/forgot` répond la même chose que l'adresse existe ou non.

## Lecture des pochettes

Deux lectures existent. Avec une clé `ANTHROPIC_API_KEY`, les photos sont lues par une IA ; sans clé, ou si l'IA est indisponible, la lecture intégrée au navigateur prend le relais sans rien demander.

### Par IA (`src/vision.js`)

Le navigateur envoie le recto et le verso à `POST /api/read`. Le serveur les montre à Claude (API d'Anthropic), qui rend ce qui est imprimé : artiste, titre, label, année, titres face par face — jamais une liste « de mémoire ». Sur une compilation, chaque titre garde son interprète (« Tino Rossi – Petit Papa Noël »). Aucune base de disques n'est consultée : la fiche est ce qui se lit sur le disque que la personne possède. Si la pochette n'indique pas les faces, la liste est numérotée et la personne ajoute une ligne « Face B ».

Dès que les deux photos d'un nouveau disque sont choisies, la lecture part toute seule. Un champ corrigé à la main n'est plus écrasé. Une lecture coûte environ 2 centimes avec le modèle par défaut ; deux plafonds journaliers (par compte, et pour tout le site) bornent la dépense.

Les photos partent chez Anthropic sans aucune information de compte ; les pages « À propos » et « Confidentialité » le disent.

### Intégrée (`public/reader.js`)

Tesseract rend des mots et leur position, pas une mise en page : sur un verso à deux colonnes, « 1. Titre A      1. Titre B » arrive sur une seule ligne. `reader.js` reconstruit donc la page :

1. *fond aplani* — chaque pixel est comparé au fond qui l'entoure ; dégradé, reflet ou ombre ne font plus disparaître la moitié du texte, et le texte clair sur fond sombre se lit comme l'inverse ;
2. *segments* — une ligne est coupée là où un grand blanc sépare deux colonnes ;
3. *colonnes* — les segments alignés forment une colonne, lue de haut en bas ; les colonnes d'une même bande, de gauche à droite (un double album en grille 2×2 donne bien A, B, C, D) ;
4. *pistes* — numéros (`1.`, `A1`, `01`), durées et en-têtes de face disent quelles lignes sont des titres ; crédits et mentions légales sont écartés ; numéros, durées, pointillés et crédits d'auteur sont retirés du titre ;
5. *faces* — en-tête (`SIDE ONE`, `Face B`, `Côté 1`…), préfixe `A1`/`B2`, numérotation qui repart à 1, ou à défaut une face par colonne.

La lecture part de la photo d'origine (recadrée), pas de la version réduite envoyée au serveur : les petits caractères en dépendent. Sur une fiche existante, « Remplir automatiquement » relit la photo déjà enregistrée.

## Tests

```bash
npm test
```

Sans navigateur ni réseau : `test/vision.test.js` remplace l'IA par un double qui répond au format de l'API d'Anthropic.

## Stack

Node 20+ / Express · PostgreSQL · Claude (API d'Anthropic) pour lire les pochettes · Tesseract.js (côté navigateur, en relais) · sharp · JWT en cookie httpOnly

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (fournie par Railway) |
| `JWT_SECRET` | Secret pour signer les sessions (chaîne aléatoire longue) |
| `NODE_ENV` | `production` en ligne |
| `RESEND_API_KEY` | Clé d'API Resend. **Absente, le site fonctionne** : les e-mails sont écrits dans les logs au lieu d'être envoyés |
| `MAIL_FROM` | Expéditeur, ex. `Vinylthèque <bonjour@ton-domaine.fr>` (défaut : `onboarding@resend.dev`) |
| `APP_URL` | Base des liens envoyés par e-mail (sinon déduite de `RAILWAY_PUBLIC_DOMAIN`) |
| `ANTHROPIC_API_KEY` | Clé d'API Anthropic. **Absente, le site fonctionne** avec la lecture intégrée au navigateur |
| `ANTHROPIC_WORKSPACE_ID` | Seulement si la clé n'est pas rattachée à un espace de travail : l'identifiant de l'espace à utiliser (`wrkspc_…`) |
| `AI_MODEL` | Facultatif : modèle qui lit les photos (défaut : `claude-sonnet-5-5` ; `claude-haiku-5-5` coûte quinze fois moins) |
| `AI_EFFORT` | Facultatif : effort de réflexion du modèle, `low`, `medium` ou `high` (défaut : `medium`) |
| `AI_USER_DAILY` | Facultatif : lectures par IA par compte et par jour (défaut : 40) |
| `AI_DAILY_LIMIT` | Facultatif : lectures par IA par jour pour tout le site (défaut : 300) |
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
