import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import { log } from './index';
import { stripeStorage } from './stripeStorage';
import type { MembershipTier } from '@shared/schema';

async function determineTierFromSubscription(subscription: any): Promise<MembershipTier> {
  try {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    if (!priceId) return 'basic';

    const products = await stripeStorage.listProductsWithPrices();
    
    for (const row of products as any[]) {
      if (row.price_id === priceId) {
        const metadata = row.product_metadata || {};
        if (metadata.tier) {
          return metadata.tier as MembershipTier;
        }
        
        const productName = (row.product_name || '').toLowerCase();
        if (productName.includes('elite')) return 'elite';
        if (productName.includes('pro')) return 'pro';
        if (productName.includes('basic')) return 'basic';
      }
    }
    
    return 'pro';
  } catch (error) {
    log(`Error determining tier: ${error}`, 'stripe');
    return 'pro';
  }
}

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
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const tier = isPremium ? await determineTierFromSubscription(subscription) : 'free';
          
          await storage.updateStripeSubscription(
            profile.userId,
            subscription.id,
            isPremium,
            tier,
            priceId
          );
          log(`Updated subscription for user ${profile.userId}: ${status}, tier: ${tier}`, 'stripe');
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
