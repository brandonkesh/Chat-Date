import { paypalFetch } from './paypalClient';
import { log } from './index';
import type { MembershipTier } from '@shared/schema';

export interface PaypalPlan {
  productId: string;
  planId: string;
  tier: MembershipTier;
  name: string;
  description: string;
  amount: number;
  currency: string;
}

const TIER_DEFINITIONS: Array<{
  tier: MembershipTier;
  name: string;
  description: string;
  amount: string;
}> = [
  {
    tier: 'basic',
    name: 'Crush Basic',
    description:
      '10 super likes per day, see who viewed your profile, basic filters, ad-free, AI chat advisor.',
    amount: '4.99',
  },
  {
    tier: 'pro',
    name: 'Crush Pro',
    description:
      'Unlimited super likes, see everyone who likes you, priority matching, voice & video calls, AI photo match.',
    amount: '9.99',
  },
  {
    tier: 'elite',
    name: 'Crush Elite',
    description:
      'Everything in Pro plus weekly profile boost, incognito mode, VIP badge, AI profile optimizer, priority support.',
    amount: '19.99',
  },
];

const CURRENCY = 'USD';
const PRODUCT_PREFIX = 'CRUSH-DATING-';

let cachedPlans: PaypalPlan[] | null = null;

async function findExistingProduct(tier: MembershipTier): Promise<string | null> {
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ page_size: '20' });
    if (pageToken) params.set('page_token', pageToken);
    const res: any = await paypalFetch(`/v1/catalogs/products?${params}`);
    const products: any[] = res.products || [];
    for (const p of products) {
      if (p.id === `${PRODUCT_PREFIX}${tier.toUpperCase()}`) return p.id;
    }
    const nextLink = (res.links || []).find((l: any) => l.rel === 'next');
    pageToken = nextLink ? new URL(nextLink.href).searchParams.get('page_token') || undefined : undefined;
  } while (pageToken);
  return null;
}

async function findActivePlanForProduct(
  productId: string,
  tier: MembershipTier,
): Promise<{ planId: string; amount: string } | null> {
  const params = new URLSearchParams({
    product_id: productId,
    page_size: '20',
    total_required: 'false',
  });
  const res: any = await paypalFetch(`/v1/billing/plans?${params}`);
  const plans: any[] = res.plans || [];
  for (const p of plans) {
    if (p.status === 'ACTIVE' && p.name === `${tier.toUpperCase()} Monthly`) {
      const detail: any = await paypalFetch(`/v1/billing/plans/${p.id}`);
      const amount =
        detail.billing_cycles?.[0]?.pricing_scheme?.fixed_price?.value || '0.00';
      return { planId: p.id, amount };
    }
  }
  return null;
}

async function createProduct(
  tier: MembershipTier,
  name: string,
  description: string,
): Promise<string> {
  const id = `${PRODUCT_PREFIX}${tier.toUpperCase()}`;
  const product: any = await paypalFetch('/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      id,
      name,
      description,
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  });
  return product.id;
}

async function createMonthlyPlan(
  productId: string,
  tier: MembershipTier,
  amount: string,
): Promise<string> {
  const plan: any = await paypalFetch('/v1/billing/plans', {
    method: 'POST',
    body: JSON.stringify({
      product_id: productId,
      name: `${tier.toUpperCase()} Monthly`,
      description: `${tier} monthly subscription`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: amount, currency_code: CURRENCY },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 2,
      },
    }),
  });
  return plan.id;
}

export async function ensurePaypalPlans(): Promise<PaypalPlan[]> {
  if (cachedPlans) return cachedPlans;
  const result: PaypalPlan[] = [];

  for (const def of TIER_DEFINITIONS) {
    let productId = await findExistingProduct(def.tier);
    if (!productId) {
      log(`Creating PayPal product for ${def.tier}...`, 'paypal');
      productId = await createProduct(def.tier, def.name, def.description);
    }

    let plan = await findActivePlanForProduct(productId, def.tier);
    if (!plan) {
      log(`Creating PayPal plan for ${def.tier} at $${def.amount}/mo...`, 'paypal');
      const planId = await createMonthlyPlan(productId, def.tier, def.amount);
      plan = { planId, amount: def.amount };
    }

    result.push({
      productId,
      planId: plan.planId,
      tier: def.tier,
      name: def.name,
      description: def.description,
      amount: parseFloat(plan.amount),
      currency: CURRENCY,
    });
  }

  cachedPlans = result;
  return result;
}

export function getCachedPlans(): PaypalPlan[] {
  return cachedPlans || [];
}

export function getPlanByTier(tier: MembershipTier): PaypalPlan | undefined {
  return getCachedPlans().find((p) => p.tier === tier);
}

export function getPlanByPlanId(planId: string): PaypalPlan | undefined {
  return getCachedPlans().find((p) => p.planId === planId);
}

export async function createSubscription(
  planId: string,
  email: string,
  returnUrl: string,
  cancelUrl: string,
  customId: string,
): Promise<{ subscriptionId: string; approvalUrl: string }> {
  const sub: any = await paypalFetch('/v1/billing/subscriptions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      plan_id: planId,
      subscriber: { email_address: email },
      custom_id: customId,
      application_context: {
        brand_name: 'Crush Dating',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
        shipping_preference: 'NO_SHIPPING',
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
        },
      },
    }),
  });
  const approvalLink = (sub.links || []).find((l: any) => l.rel === 'approve');
  if (!approvalLink) {
    throw new Error('PayPal subscription created but no approval link returned');
  }
  return { subscriptionId: sub.id, approvalUrl: approvalLink.href };
}

export async function getSubscription(subscriptionId: string): Promise<any> {
  return await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}`);
}

export async function cancelSubscription(
  subscriptionId: string,
  reason = 'User requested cancellation',
): Promise<void> {
  await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
