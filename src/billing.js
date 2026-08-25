/* Abonnement Vinylthèque via Stripe Checkout.
   Aucun numéro de carte ne transite par ce serveur : le paiement se fait
   entièrement sur les pages hébergées par Stripe. */

import Stripe from 'stripe';
import { pool } from './db.js';

export const FREE_LIMIT = Number(process.env.FREE_LIMIT || 25);

export const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || '',
  yearly: process.env.STRIPE_PRICE_YEARLY || ''
};

const key = process.env.STRIPE_SECRET_KEY || '';
export const stripe = key ? new Stripe(key) : null;

/* Le site doit rester utilisable tant que Stripe n'est pas configuré :
   dans ce cas l'offre n'est simplement pas proposée. */
export const billingReady = () =>
  Boolean(stripe && PRICES.monthly && PRICES.yearly);

export async function countVinyls(userId) {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM vinyls WHERE user_id = $1', [userId]);
  return rows[0].n;
}

export async function getUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, username, plan, stripe_customer_id, subscription_id,
            plan_interval, plan_renews_at, plan_cancels
       FROM users WHERE id = $1`, [userId]);
  return rows[0];
}

/* Un compte est « pro » s'il est marqué pro, ou si sa période payée court
   encore — le second cas rattrape un webhook manqué. */
export function isPro(u) {
  if (!u) return false;
  if (u.plan === 'pro') return true;
  return Boolean(u.plan_renews_at && new Date(u.plan_renews_at) > new Date());
}

async function customerFor(user, req) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const c = await stripe.customers.create({
    email: user.email,
    name: user.username,
    metadata: { user_id: String(user.id), username: user.username }
  });
  await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [c.id, user.id]);
  return c.id;
}

/* ------------------------------------------------------------- routes */

export function mountBilling(app, { requireAuth, baseUrl }) {

  app.get('/api/billing/status', async (req, res) => {
    if (!req.user) {
      return res.json({ ready: billingReady(), limit: FREE_LIMIT, plan: 'anon' });
    }
    const u = await getUser(req.user.id);
    res.json({
      ready: billingReady(),
      limit: FREE_LIMIT,
      plan: isPro(u) ? 'pro' : 'free',
      count: await countVinyls(req.user.id),
      interval: u.plan_interval || null,
      renewsAt: u.plan_renews_at || null,
      cancels: u.plan_cancels === true
    });
  });

  app.post('/api/billing/checkout', requireAuth, async (req, res) => {
    if (!billingReady()) return res.status(503).json({ error: "L'abonnement n'est pas encore actif." });
    const interval = req.body?.interval === 'yearly' ? 'yearly' : 'monthly';
    try {
      const user = await getUser(req.user.id);
      if (isPro(user)) return res.status(409).json({ error: 'Votre abonnement est déjà actif.' });

      const base = baseUrl(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: await customerFor(user, req),
        line_items: [{ price: PRICES[interval], quantity: 1 }],
        locale: 'fr',
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        client_reference_id: String(user.id),
        subscription_data: { metadata: { user_id: String(user.id) } },
        success_url: `${base}/abonnement?paiement=ok`,
        cancel_url: `${base}/abonnement?paiement=annule`
      });
      res.json({ url: session.url });
    } catch (e) {
      console.error('[stripe] checkout', e.message);
      res.status(502).json({ error: "Impossible d'ouvrir le paiement : " + e.message });
    }
  });

  /* Portail Stripe : le client change de carte, passe à l'annuel ou résilie
     lui-même. Sans lui, chaque résiliation devient un e-mail à traiter. */
  app.post('/api/billing/portal', requireAuth, async (req, res) => {
    if (!billingReady()) return res.status(503).json({ error: "L'abonnement n'est pas encore actif." });
    const user = await getUser(req.user.id);
    if (!user.stripe_customer_id) return res.status(404).json({ error: 'Aucun abonnement à gérer.' });
    try {
      const s = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        locale: 'fr',
        return_url: `${baseUrl(req)}/abonnement`
      });
      res.json({ url: s.url });
    } catch (e) {
      console.error('[stripe] portal', e.message);
      res.status(502).json({ error: e.message });
    }
  });
}

/* --------------------------------------------------------- webhook Stripe */

async function applySubscription(sub) {
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customer) return;
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  const item = sub.items?.data?.[0];
  const interval = item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
  const end = item?.current_period_end ?? sub.current_period_end;

  await pool.query(
    `UPDATE users
        SET plan = $1,
            subscription_id = $2,
            plan_interval = $3,
            plan_renews_at = $4,
            plan_cancels = $5
      WHERE stripe_customer_id = $6`,
    [active ? 'pro' : 'free', sub.id, interval,
     end ? new Date(end * 1000) : null,
     sub.cancel_at_period_end === true, customer]
  );
}

/* express.raw() est indispensable : la signature Stripe se vérifie sur le
   corps brut, un JSON déjà interprété la casse. */
export function mountStripeWebhook(app, express) {
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) return res.status(503).end();

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch (e) {
      console.error('[stripe] signature invalide', e.message);
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object;
          if (s.mode === 'subscription' && s.subscription) {
            await applySubscription(await stripe.subscriptions.retrieve(s.subscription));
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await applySubscription(event.data.object);
          break;
        default:
          break;
      }
      res.json({ received: true });
    } catch (e) {
      console.error('[stripe] traitement', event.type, e.message);
      res.status(500).end();   // Stripe réessaiera
    }
  });
}
