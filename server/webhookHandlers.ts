import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import { log } from './index';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    
    const result = await sync.processWebhook(payload, signature);
    
    if (result?.event) {
      await WebhookHandlers.handleEvent(result.event);
    }
  }

  static async handleEvent(event: any): Promise<void> {
    const { type, data } = event;

    switch (type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = data.object;
        const customerId = subscription.customer;
        const status = subscription.status;

        const profile = await storage.getProfileByStripeCustomerId(customerId);
        if (profile) {
          const isPremium = status === 'active' || status === 'trialing';
          await storage.updateStripeSubscription(
            profile.userId,
            subscription.id,
            isPremium
          );
          log(`Updated subscription for user ${profile.userId}: ${status}`, 'stripe');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = data.object;
        const customerId = subscription.customer;

        const profile = await storage.getProfileByStripeCustomerId(customerId);
        if (profile) {
          await storage.updateStripeSubscription(
            profile.userId,
            subscription.id,
            false
          );
          log(`Canceled subscription for user ${profile.userId}`, 'stripe');
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = data.object;
        log(`Checkout completed: ${session.id}`, 'stripe');
        break;
      }

      default:
        break;
    }
  }
}
