import { paypalFetch } from './paypalClient';
import { storage } from './storage';
import { log } from './index';
import { getPlanByPlanId } from './paypalService';
import type { MembershipTier } from '@shared/schema';

function tierFromPlanId(planId?: string): MembershipTier | null {
  if (!planId) return null;
  const plan = getPlanByPlanId(planId);
  return plan?.tier ?? null;
}

async function verifyWebhookSignature(
  headers: Record<string, string>,
  rawBody: string,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    if (process.env.NODE_ENV === 'production') {
      log(
        'PAYPAL_WEBHOOK_ID not set in production — REJECTING webhook (security)',
        'paypal',
      );
      return false;
    }
    log(
      'PAYPAL_WEBHOOK_ID not set — skipping signature verification (development only)',
      'paypal',
    );
    return true;
  }

  try {
    const result: any = await paypalFetch('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    });
    return result.verification_status === 'SUCCESS';
  } catch (err: any) {
    log(`Signature verify failed: ${err.message}`, 'paypal');
    return false;
  }
}

const processedEventIds = new Set<string>();
const MAX_DEDUPE_CACHE = 1000;

function markEventProcessed(id: string): boolean {
  if (processedEventIds.has(id)) return false;
  processedEventIds.add(id);
  if (processedEventIds.size > MAX_DEDUPE_CACHE) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
  return true;
}

export class PaypalWebhookHandler {
  static async processWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const verified = await verifyWebhookSignature(headers, rawBody);
    if (!verified) {
      throw new Error('Invalid PayPal webhook signature');
    }

    const event = JSON.parse(rawBody);
    if (event?.id && !markEventProcessed(event.id)) {
      log(`Skipping duplicate webhook event ${event.id}`, 'paypal');
      return;
    }
    await PaypalWebhookHandler.handleEvent(event);
  }

  static async handleEvent(event: any): Promise<void> {
    const type: string = event.event_type;
    const resource = event.resource || {};

    switch (type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.UPDATED':
      case 'BILLING.SUBSCRIPTION.RE-ACTIVATED': {
        const subscriptionId: string = resource.id;
        const planId: string = resource.plan_id;
        const status: string = resource.status;
        const subscriberId: string | undefined = resource.subscriber?.payer_id;
        const customId: string | undefined = resource.custom_id;

        // SECURITY: ownership is derived ONLY from a server-issued subscription
        // record (created via /api/checkout, which stores the subscription id on
        // the owning profile before approval). We never trust the webhook's
        // attacker-controllable `custom_id` to decide which account this affects.
        const ownerProfile =
          await storage.getProfileByPaypalSubscriptionId(subscriptionId);
        const userId = ownerProfile?.userId;
        if (!userId) {
          log(
            `No server-issued subscription record for ${subscriptionId} — ignoring event (not created through checkout)`,
            'paypal',
          );
          break;
        }
        // Defense-in-depth: a legitimate subscription always has custom_id equal
        // to the owning userId. A mismatch means the metadata was tampered with.
        if (customId && customId !== userId) {
          log(
            `custom_id mismatch for subscription ${subscriptionId} (event custom_id != owner) — refusing to apply`,
            'paypal',
          );
          break;
        }

        const isActive = status === 'ACTIVE';
        let tier: MembershipTier | undefined;
        if (isActive) {
          const resolvedTier = tierFromPlanId(planId);
          if (!resolvedTier) {
            log(
              `Unknown plan_id ${planId} for subscription ${subscriptionId} — leaving tier unchanged`,
              'paypal',
            );
            tier = undefined;
          } else {
            tier = resolvedTier;
          }
        } else {
          tier = 'free';
        }

        await storage.updatePaypalSubscription(
          userId,
          subscriptionId,
          isActive,
          tier,
          planId,
          subscriberId,
        );
        log(
          `Updated subscription for user ${userId}: ${status}, tier: ${tier}`,
          'paypal',
        );
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        const subscriptionId: string = resource.id;
        const customId: string | undefined = resource.custom_id;

        // SECURITY: same as the activation branch — resolve the owner strictly
        // from the server-issued subscription record, never from `custom_id`.
        const ownerProfile =
          await storage.getProfileByPaypalSubscriptionId(subscriptionId);
        const userId = ownerProfile?.userId;
        if (!userId) {
          log(
            `No server-issued subscription record for ${subscriptionId} — ignoring cancel/expire event`,
            'paypal',
          );
          break;
        }
        if (customId && customId !== userId) {
          log(
            `custom_id mismatch on cancel/expire for subscription ${subscriptionId} — refusing to apply`,
            'paypal',
          );
          break;
        }

        await storage.updatePaypalSubscription(userId, subscriptionId, false);
        log(`Canceled subscription for user ${userId}`, 'paypal');
        break;
      }

      case 'PAYMENT.SALE.COMPLETED':
      case 'PAYMENT.SALE.REFUNDED':
      case 'PAYMENT.SALE.REVERSED':
        log(`Payment event ${type}: ${resource.id}`, 'paypal');
        break;

      default:
        log(`Unhandled PayPal event: ${type}`, 'paypal');
        break;
    }
  }
}
