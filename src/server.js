import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { pool, initDb } from './db.js';
import { signIn, signOut, readUser, requireAuth } from './auth.js';
import { sendWelcome, sendReset, sendPasswordChanged, mailReady, baseUrl } from './mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(readUser);
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: true, maxAge: 0 }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 2 }
});

/* ---------------------------------------------------------------- utils */

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function normalizeTracks(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = list.split('\n'); }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((t) => (typeof t === 'string' ? { title: t } : t))
    .map((t) => ({ side: clean(t.side, 4), title: clean(t.title, 200) }))
    .filter((t) => t.title.length > 0)
    .slice(0, 60);
}

/* Redimensionne et RÉ-ENCODE la photo. sharp ne recopie aucune métadonnée
   sauf appel explicite à withMetadata() : le JPEG stocké est donc dépourvu
   d'EXIF (GPS, appareil, date), d'IPTC, de XMP et de vignette. .rotate()
   applique l'orientation EXIF d'origine avant qu'elle ne disparaisse. */
/* Jeton envoyé par e-mail : on garde son empreinte en base, pas sa valeur.
   Une fuite de la base ne permet donc pas de prendre la main sur un compte. */
const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

/* Limitation simple en mémoire, pour éviter d'arroser une boîte mail. */
const hits = new Map();
function throttle(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

async function shrink(buf) {
  return sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: false })
    .toBuffer();
}

async function saveImages(vinylId, files) {
  for (const kind of ['front', 'back']) {
    const file = files?.[kind]?.[0];
    if (!file) continue;
    const data = await shrink(file.buffer);
    await pool.query(
      `INSERT INTO images (vinyl_id, kind, mime, data) VALUES ($1,$2,'image/jpeg',$3)
       ON CONFLICT (vinyl_id, kind) DO UPDATE SET data = EXCLUDED.data, mime = EXCLUDED.mime`,
      [vinylId, kind, data]
    );
  }
}

async function listVinyls(userId) {
  const { rows } = await pool.query(
    `SELECT v.*,
            EXISTS (SELECT 1 FROM images i WHERE i.vinyl_id = v.id AND i.kind='front') AS has_front,
            EXISTS (SELECT 1 FROM images i WHERE i.vinyl_id = v.id AND i.kind='back')  AS has_back
       FROM vinyls v WHERE v.user_id = $1
      ORDER BY lower(v.artist), lower(v.title)`,
    [userId]
  );
  return rows;
}

/* ----------------------------------------------------------------- auth */

app.post('/api/register', async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const username = clean(req.body.username, 32).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const password = String(req.body.password ?? '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Email invalide.' });
  if (username.length < 3) return res.status(400).json({ error: "Nom d'utilisateur trop court (3 caractères min., lettres/chiffres)." });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min.).' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const token = newToken();
    const { rows } = await pool.query(
      `INSERT INTO users (email, username, password_hash, verify_hash, verify_expires)
       VALUES ($1,$2,$3,$4, now() + interval '48 hours')
       RETURNING id, username, is_public, email_verified`,
      [email, username, hash, hashToken(token)]
    );
    signIn(res, rows[0]);
    res.json({ user: rows[0] });

    // envoi après la réponse : un souci d'e-mail ne doit pas bloquer l'inscription
    sendWelcome({ to: email, username, url: `${baseUrl(req)}/verifier?token=${token}` })
      .catch((e) => console.error('[mail] bienvenue', e.message));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Cet email ou ce nom est déjà utilisé.' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/login', async (req, res) => {
  const id = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password ?? '');
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 OR username = $1', [id]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  signIn(res, user);
  res.json({ user: {
    id: user.id, username: user.username,
    is_public: user.is_public, email_verified: user.email_verified
  } });
});

app.post('/api/logout', (req, res) => { signOut(res); res.json({ ok: true }); });

app.get('/api/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { rows } = await pool.query(
    'SELECT id, username, email, is_public, email_verified FROM users WHERE id = $1', [req.user.id]);
  res.json({ user: rows[0] ?? null, mail: mailReady() });
});

app.post('/api/me/visibility', requireAuth, async (req, res) => {
  const isPublic = !!req.body.is_public;
  await pool.query('UPDATE users SET is_public = $1 WHERE id = $2', [isPublic, req.user.id]);
  res.json({ is_public: isPublic });
});

/* --------------------------------------- vérification & mot de passe oublié */

app.get('/api/verify', async (req, res) => {
  const h = hashToken(req.query.token || '');
  const { rows } = await pool.query(
    `UPDATE users SET email_verified = TRUE, verify_hash = NULL, verify_expires = NULL
      WHERE verify_hash = $1 AND verify_expires > now()
      RETURNING id, username, is_public, email_verified`,
    [h]
  );
  if (!rows[0]) return res.status(400).json({ error: 'Lien invalide ou expiré. Demande un nouvel envoi.' });
  signIn(res, rows[0]);
  res.json({ user: rows[0] });
});

app.post('/api/verify/resend', requireAuth, async (req, res) => {
  if (!throttle('v:' + req.user.id, 3, 3600e3))
    return res.status(429).json({ error: 'Trop de demandes. Réessaie dans une heure.' });

  const token = newToken();
  const { rows } = await pool.query(
    `UPDATE users SET verify_hash = $1, verify_expires = now() + interval '48 hours'
      WHERE id = $2 AND email_verified = FALSE RETURNING email, username`,
    [hashToken(token), req.user.id]
  );
  if (!rows[0]) return res.json({ ok: true });   // déjà vérifié
  try {
    await sendWelcome({ to: rows[0].email, username: rows[0].username,
      url: `${baseUrl(req)}/verifier?token=${token}` });
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: "L'envoi de l'e-mail a échoué : " + e.message }); }
});

/* Réponse identique que l'adresse existe ou non : on n'indique jamais
   à un inconnu si un compte est associé à une adresse. */
app.post('/api/forgot', async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  if (!throttle('f:' + (req.ip || '') , 5, 3600e3))
    return res.status(429).json({ error: 'Trop de demandes. Réessaie plus tard.' });

  const { rows } = await pool.query('SELECT id, email, username FROM users WHERE email = $1', [email]);
  if (rows[0] && throttle('fu:' + rows[0].id, 3, 3600e3)) {
    const token = newToken();
    await pool.query(
      `UPDATE users SET reset_hash = $1, reset_expires = now() + interval '1 hour' WHERE id = $2`,
      [hashToken(token), rows[0].id]
    );
    sendReset({ to: rows[0].email, username: rows[0].username,
      url: `${baseUrl(req)}/motdepasse?token=${token}` })
      .catch((e) => console.error('[mail] réinitialisation', e.message));
  }
  res.json({ ok: true });
});

app.post('/api/reset', async (req, res) => {
  const password = String(req.body.password ?? '');
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min.).' });

  const h = hashToken(req.body.token || '');
  const { rows } = await pool.query(
    'SELECT id, email, username, is_public FROM users WHERE reset_hash = $1 AND reset_expires > now()', [h]
  );
  const user = rows[0];
  if (!user) return res.status(400).json({ error: 'Lien invalide ou expiré. Refais une demande.' });

  await pool.query(
    `UPDATE users SET password_hash = $1, reset_hash = NULL, reset_expires = NULL,
                      email_verified = TRUE
      WHERE id = $2`,
    [await bcrypt.hash(password, 10), user.id]
  );
  signIn(res, user);
  res.json({ user: { id: user.id, username: user.username, is_public: user.is_public, email_verified: true } });
  sendPasswordChanged({ to: user.email, username: user.username })
    .catch((e) => console.error('[mail] confirmation', e.message));
});

/* --------------------------------------------------------------- vinyls */

app.get('/api/vinyls', requireAuth, async (req, res) => {
  res.json({ vinyls: await listVinyls(req.user.id) });
});

const photoFields = upload.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }]);

app.post('/api/vinyls', requireAuth, photoFields, async (req, res) => {
  const b = req.body;
  const title = clean(b.title);
  if (!title) return res.status(400).json({ error: "Le nom du vinyle est obligatoire." });
  try {
    const { rows } = await pool.query(
      `INSERT INTO vinyls (user_id, title, artist, year, label, notes, tracks)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.id, title, clean(b.artist), clean(b.year, 12), clean(b.label), clean(b.notes, 2000),
       JSON.stringify(normalizeTracks(b.tracks))]
    );
    await saveImages(rows[0].id, req.files);
    res.json({ id: rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur à la création.' }); }
});

app.put('/api/vinyls/:id', requireAuth, photoFields, async (req, res) => {
  const b = req.body;
  const id = Number(req.params.id);
  const { rowCount } = await pool.query(
    `UPDATE vinyls SET title=$1, artist=$2, year=$3, label=$4, notes=$5, tracks=$6
      WHERE id=$7 AND user_id=$8`,
    [clean(b.title), clean(b.artist), clean(b.year, 12), clean(b.label), clean(b.notes, 2000),
     JSON.stringify(normalizeTracks(b.tracks)), id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Vinyle introuvable.' });
  await saveImages(id, req.files);
  res.json({ ok: true });
});

app.delete('/api/vinyls/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM vinyls WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
  res.json({ ok: true });
});

app.get('/api/vinyls/:id/image/:kind', async (req, res) => {
  const kind = req.params.kind === 'back' ? 'back' : 'front';
  const { rows } = await pool.query(
    `SELECT i.mime, i.data, u.is_public, v.user_id
       FROM images i JOIN vinyls v ON v.id = i.vinyl_id JOIN users u ON u.id = v.user_id
      WHERE i.vinyl_id = $1 AND i.kind = $2`,
    [Number(req.params.id), kind]
  );
  const img = rows[0];
  if (!img) return res.status(404).end();
  if (!img.is_public && req.user?.id !== img.user_id) return res.status(403).end();
  res.set('Content-Type', img.mime);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(img.data);
});

/* ------------------------------------------- accueil : ajouts récents */

app.get('/api/recent', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT v.id, v.title, v.artist, v.year
       FROM vinyls v
       JOIN users u ON u.id = v.user_id
      WHERE u.is_public = TRUE
        AND EXISTS (SELECT 1 FROM images i WHERE i.vinyl_id = v.id AND i.kind = 'front')
      ORDER BY v.created_at DESC
      LIMIT 6`
  );
  res.set('Cache-Control', 'public, max-age=120');
  res.json({ vinyls: rows });
});

/* ------------------------------------------------------------ statistiques */

app.get('/api/stats', requireAuth, async (req, res) => {
  const u = [req.user.id];
  const [tot, dec, art, lab] = await Promise.all([
    pool.query(`SELECT count(*)::int AS disques,
                       coalesce(sum(jsonb_array_length(tracks)),0)::int AS titres,
                       count(*) FILTER (WHERE artist <> '')::int AS avec_artiste
                  FROM vinyls WHERE user_id = $1`, u),
    pool.query(`SELECT (left(year,3) || '0') AS decennie, count(*)::int AS n
                  FROM vinyls
                 WHERE user_id = $1 AND year ~ '^(19|20)[0-9]{2}$'
              GROUP BY 1 ORDER BY 1`, u),
    pool.query(`SELECT artist, count(*)::int AS n FROM vinyls
                 WHERE user_id = $1 AND artist <> ''
              GROUP BY 1 ORDER BY n DESC, artist LIMIT 6`, u),
    pool.query(`SELECT label, count(*)::int AS n FROM vinyls
                 WHERE user_id = $1 AND label <> ''
              GROUP BY 1 ORDER BY n DESC, label LIMIT 6`, u)
  ]);
  res.json({
    total: tot.rows[0],
    decennies: dec.rows,
    artistes: art.rows,
    labels: lab.rows
  });
});

/* --------------------------------------------------- collection publique */

app.get('/api/u/:username', async (req, res) => {
  const username = clean(req.params.username, 32).toLowerCase();
  const { rows } = await pool.query('SELECT id, username, is_public FROM users WHERE username = $1', [username]);
  const owner = rows[0];
  if (!owner) return res.status(404).json({ error: 'Collection introuvable.' });
  if (!owner.is_public && req.user?.id !== owner.id) {
    return res.status(403).json({ error: 'Cette collection est privée.' });
  }
  res.json({ owner: { username: owner.username }, vinyls: await listVinyls(owner.id) });
});

/* -------------------------------------- recherche de titres (MusicBrainz) */

app.get('/api/lookup', async (req, res) => {
  const artist = clean(req.query.artist, 120);
  const title = clean(req.query.title, 120);
  if (!title) return res.status(400).json({ error: 'Titre de l\'album requis.' });

  const headers = { 'User-Agent': 'Vinyltheque/1.0 (collection personnelle de vinyles)' };
  const q = [`release:"${title}"`, artist ? `artist:"${artist}"` : '', 'format:"Vinyl"']
    .filter(Boolean).join(' AND ');

  try {
    const searchUrl = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
    let r = await fetch(searchUrl, { headers });
    let data = await r.json();
    let releases = data.releases ?? [];

    if (!releases.length) {
      const q2 = [`release:"${title}"`, artist ? `artist:"${artist}"` : ''].filter(Boolean).join(' AND ');
      r = await fetch(`https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(q2)}&fmt=json&limit=5`, { headers });
      data = await r.json();
      releases = data.releases ?? [];
    }
    if (!releases.length) return res.json({ found: false });

    const best = releases[0];
    const detail = await (await fetch(
      `https://musicbrainz.org/ws/2/release/${best.id}?inc=recordings+artist-credits+labels&fmt=json`,
      { headers }
    )).json();

    const tracks = [];
    (detail.media ?? []).forEach((medium, mi) => {
      const side = medium.position ? String.fromCharCode(64 + medium.position) : String(mi + 1);
      (medium.tracks ?? []).forEach((t, ti) => tracks.push({ side: `${side}${ti + 1}`, title: t.title }));
    });

    res.json({
      found: true,
      title: detail.title ?? best.title ?? title,
      artist: (detail['artist-credit'] ?? []).map((a) => a.name).join(', ') || artist,
      year: (detail.date ?? best.date ?? '').slice(0, 4),
      label: (detail['label-info'] ?? []).map((l) => l.label?.name).filter(Boolean)[0] ?? '',
      tracks
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Recherche en ligne indisponible.' });
  }
});

/* ---------------------------------------------------------------- pages */

app.get(['/u/:username', '/login', '/collection', '/recherche', '/verifier', '/motdepasse', '/statistiques'], (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`Vinylthèque en écoute sur :${port}`)))
  .catch((e) => { console.error('Échec init DB', e); process.exit(1); });
