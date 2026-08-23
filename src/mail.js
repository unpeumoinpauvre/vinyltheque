/* Envoi d'e-mails via Resend (API HTTP, pas de dépendance npm).
   Sans RESEND_API_KEY le site fonctionne quand même : le message est
   écrit dans les logs au lieu d'être envoyé. */

const API = 'https://api.resend.com/emails';

export const mailReady = () => Boolean(process.env.RESEND_API_KEY);

export function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `${req?.protocol ?? 'http'}://${req?.get?.('host') ?? 'localhost:3000'}`;
}

async function send({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Vinylthèque <onboarding@resend.dev>';

  if (!key) {
    console.warn(`[mail] RESEND_API_KEY absent — e-mail non envoyé.\n  à : ${to}\n  objet : ${subject}\n  ${text}`);
    return { skipped: true };
  }
  const r = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('[mail] échec Resend', r.status, data);
    throw new Error(data?.message || `Resend a répondu ${r.status}`);
  }
  return data;
}

/* ------------------------------------------------------------- gabarits */

const layout = (title, body) => `
<!doctype html><html lang="fr"><body style="margin:0;background:#f4f2f0;padding:28px 14px;
  font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c21">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;
      border:1px solid #e4e0dd;overflow:hidden">
      <tr><td style="background:#17171b;padding:18px 26px;color:#fff;font-weight:700;letter-spacing:.2px">
        ◉&nbsp; Vinylthèque</td></tr>
      <tr><td style="padding:26px">
        <h1 style="margin:0 0 14px;font-size:20px">${title}</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:16px 26px;background:#faf8f7;color:#8a8590;font-size:12.5px;border-top:1px solid #eee">
        Tu reçois cet e-mail parce qu'une action a été demandée avec cette adresse sur Vinylthèque.
        Si ce n'était pas toi, ignore ce message.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

const button = (url, label) => `
  <p style="margin:22px 0">
    <a href="${url}" style="background:#e0603a;color:#fff;text-decoration:none;font-weight:600;
       padding:12px 22px;border-radius:10px;display:inline-block">${label}</a>
  </p>
  <p style="margin:0;color:#6f6c76;font-size:13px">Ou copie ce lien dans ton navigateur :<br>
    <span style="word-break:break-all">${url}</span></p>`;

export function sendWelcome({ to, username, url }) {
  return send({
    to,
    subject: 'Confirme ton adresse — Vinylthèque',
    text: `Bienvenue ${username} ! Confirme ton adresse : ${url} (lien valable 48 heures).`,
    html: layout(`Bienvenue, ${username} !`, `
      <p style="margin:0">Ton compte est créé. Confirme ton adresse e-mail pour pouvoir
      récupérer ton mot de passe en cas d'oubli.</p>
      ${button(url, 'Confirmer mon adresse')}
      <p style="margin:18px 0 0;color:#6f6c76;font-size:13px">Ce lien est valable 48 heures.</p>`)
  });
}

export function sendReset({ to, username, url }) {
  return send({
    to,
    subject: 'Réinitialiser ton mot de passe — Vinylthèque',
    text: `Réinitialise ton mot de passe : ${url} (lien valable 1 heure).`,
    html: layout('Nouveau mot de passe', `
      <p style="margin:0">Bonjour ${username}, une réinitialisation de mot de passe a été
      demandée pour ton compte.</p>
      ${button(url, 'Choisir un nouveau mot de passe')}
      <p style="margin:18px 0 0;color:#6f6c76;font-size:13px">Ce lien est valable 1 heure.
      Tant que tu ne l'utilises pas, ton mot de passe actuel reste valable.</p>`)
  });
}

export function sendPasswordChanged({ to, username }) {
  return send({
    to,
    subject: 'Ton mot de passe a été modifié — Vinylthèque',
    text: `${username}, le mot de passe de ton compte Vinylthèque vient d'être modifié.`,
    html: layout('Mot de passe modifié', `
      <p style="margin:0">${username}, le mot de passe de ton compte vient d'être modifié.</p>
      <p style="margin:14px 0 0">Si tu n'es pas à l'origine de ce changement, réponds à cet
      e-mail immédiatement.</p>`)
  });
}
