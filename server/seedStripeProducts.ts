import { getUncachableStripeClient, getStripeSync } from './stripeClient';

async function seedStripeProducts() {
  console.log("Seeding Stripe products...");

  try {
    const stripe = await getUncachableStripeClient();

    const existingProducts = await stripe.products.list({ limit: 10 });
    const premiumExists = existingProducts.data.some(
      p => p.name.toLowerCase().includes('premium') || p.name.toLowerCase().includes('crush')
    );

    if (premiumExists) {
      console.log("Crush Premium product already exists. Skipping creation.");
    } else {
      console.log("Creating Crush Premium product...");
      
      const product = await stripe.products.create({
        name: "Crush Premium",
        description: "Unlock unlimited messaging, see who likes you, priority matching, and ad-free experience.",
        metadata: {
          app: "crush",
          type: "subscription"
        }
      });

      console.log(`Created product: ${product.id}`);

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 999,
        currency: "usd",
        recurring: {
          interval: "month"
        },
        metadata: {
          app: "crush"
        }
      });

      console.log(`Created monthly price: ${price.id} - $${price.unit_amount! / 100}/month`);
    }

    console.log("Syncing products to database...");
    const stripeSync = await getStripeSync();
    await stripeSync.syncBackfill();
    
    console.log("Stripe products seeded and synced!");
  } catch (error: any) {
    console.error("Error seeding Stripe products:", error.message);
    process.exit(1);
  }

  process.exit(0);
}

seedStripeProducts();
