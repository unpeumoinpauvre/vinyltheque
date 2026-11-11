# Vinylthèque

Catalogue de collection de vinyles : **deux photos par disque** (recto / verso) et **remplissage automatique des titres**.

## Fonctionnalités

- Compte utilisateur (email + mot de passe), chaque collection appartient à son compte
- Site public : la collection est consultable sur `/u/<nom-utilisateur>` (désactivable)
- Deux photos par vinyle (recto = pochette, verso = liste des titres), redimensionnées et stockées en base
- **Recadrage automatique** sur la pochette : le contour de la photo (table, mur, doigts) est détecté par l'énergie des contours et retiré ; désactivable au cas par cas
- **Métadonnées supprimées** : la photo est ré-encodée dans le navigateur *avant* l'envoi (EXIF, GPS, appareil, date, IPTC, XMP, vignette), puis à nouveau côté serveur par sharp. L'orientation EXIF est appliquée à l'image avant suppression.
- Titres remplis automatiquement, **face par face** (voir « Lecture des pochettes » plus bas) :
  1. **Lecture de la photo (OCR)** — Tesseract.js s'exécute dans le navigateur sur la photo du verso ; la mise en page (colonnes, en-têtes « Side A / Face B », numéros A1…B5) est reconstruite pour retrouver l'ordre et les faces
  2. **MusicBrainz** — vérifie la liste lue, la remplace par la liste en ligne quand c'est bien le même disque, et complète artiste, année, label
- Champs : nom, artiste, année, label, notes, titres
- Recherche instantanée dans toute la collection, **par album ou par morceau** (« sur quel disque est ce titre ? »)
- **E-mails via Resend** : confirmation d'adresse à l'inscription, mot de passe oublié, avis de changement de mot de passe. Les jetons sont stockés hachés (SHA-256), valables 48 h (confirmation) et 1 h (réinitialisation), à usage unique. `/api/forgot` répond la même chose que l'adresse existe ou non.

## Lecture des pochettes

Deux lectures existent. Avec une clé `ANTHROPIC_API_KEY`, les photos sont lues par une IA ; sans clé, ou si l'IA est indisponible, la lecture intégrée au navigateur prend le relais sans rien demander.

### Par IA (`src/vision.js`)

Le navigateur envoie le recto et le verso à `POST /api/read`. Le serveur les montre à Claude (API d'Anthropic), qui rend ce qui est imprimé : artiste, titre, label, numéro de catalogue, année, titres face par face — jamais une liste « de mémoire ». Le résultat est recoupé avec MusicBrainz, cherché d'abord par numéro de catalogue (le pressage exact), puis par titre :

- la liste lue sur la pochette reste la référence : c'est ce disque-là que la personne possède ;
- si la pochette n'indique pas les faces, elles sont reprises du pressage vinyle correspondant ;
- si la liste n'est pas sur les photos, c'est celle de la base ;
- année et label : ceux imprimés d'abord, sinon ceux de la base (l'année la plus ancienne des éditions retenues).

Dès que les deux photos d'un nouveau disque sont choisies, la lecture part toute seule. Un champ corrigé à la main n'est plus écrasé. Une lecture coûte environ 3 centimes avec le modèle par défaut ; deux plafonds journaliers (par compte, et pour tout le site) bornent la dépense.

Les photos partent chez Anthropic sans aucune information de compte ; les pages « À propos » et « Confidentialité » le disent.

### Intégrée (`public/reader.js`, `src/lookup.js`)

**Sur la photo.** Tesseract rend des mots et leur position, pas une mise en page : sur un verso à deux colonnes, « 1. Titre A      1. Titre B » arrive sur une seule ligne. `reader.js` reconstruit donc la page :

1. *fond aplani* — chaque pixel est comparé au fond qui l'entoure ; dégradé, reflet ou ombre ne font plus disparaître la moitié du texte, et le texte clair sur fond sombre se lit comme l'inverse ;
2. *segments* — une ligne est coupée là où un grand blanc sépare deux colonnes ;
3. *colonnes* — les segments alignés forment une colonne, lue de haut en bas ; les colonnes d'une même bande, de gauche à droite (un double album en grille 2×2 donne bien A, B, C, D) ;
4. *pistes* — numéros (`1.`, `A1`, `01`), durées et en-têtes de face disent quelles lignes sont des titres ; crédits et mentions légales sont écartés ; numéros, durées, pointillés et crédits d'auteur sont retirés du titre ;
5. *faces* — en-tête (`SIDE ONE`, `Face B`, `Côté 1`…), préfixe `A1`/`B2`, numérotation qui repart à 1, ou à défaut une face par colonne.

La lecture part de la photo d'origine (recadrée), pas de la version réduite envoyée au serveur : les petits caractères en dépendent. Sur une fiche existante, « Remplir automatiquement » relit la photo déjà enregistrée.

**En ligne.** MusicBrainz range les pistes par disque, pas par face ; la face est dans le numéro de piste des pressages vinyle (`A1`, `B2`). `lookup.js` cherche les pressages vinyle d'abord et lit ces numéros. Un CD n'a pas de faces : on n'en invente pas, on reprend celles lues sur la photo.

**Arbitrage.** La liste en ligne est plus propre qu'une lecture de photo, mais ce n'est pas forcément la même édition. Elle n'est retenue que si au moins la moitié de ses titres se retrouvent sur la pochette ; sinon la lecture reste.

Les requêtes vers MusicBrainz passent par une file à une requête par seconde, comme le demande le service, et les réponses sont gardées six heures en mémoire.

## Tests

```bash
npm test
```

Sans navigateur ni réseau : `test/fixtures/musicbrainz.js` contient des réponses au format de l'API MusicBrainz (33 tours, CD, double album), et `test/vision.test.js` remplace l'IA par un double qui répond au format de l'API d'Anthropic.

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
| `AI_MODEL` | Facultatif : modèle qui lit les photos (défaut : `claude-sonnet-5-5` ; `claude-haiku-5-5` coûte quinze fois moins) |
| `AI_EFFORT` | Facultatif : effort de réflexion du modèle, `low`, `medium` ou `high` (défaut : `medium`) |
| `AI_USER_DAILY` | Facultatif : lectures par IA par compte et par jour (défaut : 40) |
| `AI_DAILY_LIMIT` | Facultatif : lectures par IA par jour pour tout le site (défaut : 300) |
| `MUSICBRAINZ_URL` | Facultatif : adresse d'un miroir de l'API MusicBrainz (défaut : `https://musicbrainz.org/ws/2`) |
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
