import { paypalFetch } from './paypalClient';
import { storage } from './storage';
import { log } from './index';
import { getPlanByPlanId } from './paypalService';
import type { MembershipTier } from '@shared/schema';

function tierFromPlanId(planId?: string): MembershipTier {
  if (!planId) return 'basic';
  const plan = getPlanByPlanId(planId);
  return plan?.tier || 'basic';
}

async function verifyWebhookSignature(
  headers: Record<string, string>,
  rawBody: string,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    log(
      'PAYPAL_WEBHOOK_ID not set — skipping signature verification (NOT SAFE FOR PRODUCTION)',
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

        const userId =
          customId ||
          (await storage.getProfileByPaypalSubscriptionId(subscriptionId))?.userId;
        if (!userId) {
          log(`No user found for subscription ${subscriptionId}`, 'paypal');
          break;
        }

        const isActive = status === 'ACTIVE';
        const tier = isActive ? tierFromPlanId(planId) : 'free';

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

        const userId =
          customId ||
          (await storage.getProfileByPaypalSubscriptionId(subscriptionId))?.userId;
        if (!userId) {
          log(`No user found for subscription ${subscriptionId}`, 'paypal');
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
