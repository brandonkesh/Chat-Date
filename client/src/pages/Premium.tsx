import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Heart, MessageCircle, Sparkles, Zap, Loader2, ExternalLink, Star, Gem } from "lucide-react";
import { useMyProfile } from "@/hooks/use-dating";
import { differenceInDays } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSearch } from "wouter";
import { useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { MembershipTier } from "@shared/schema";

interface TierInfo {
  id: MembershipTier;
  name: string;
  icon: typeof Crown;
  price: number;
  color: string;
  bgGradient: string;
  features: string[];
  popular?: boolean;
}

const tiers: TierInfo[] = [
  {
    id: "basic",
    name: "Basic",
    icon: Heart,
    price: 4.99,
    color: "text-blue-500",
    bgGradient: "from-blue-400 to-blue-600",
    features: [
      "10 daily super likes",
      "See who viewed you",
      "Basic filters",
      "Ad-free experience",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    icon: Crown,
    price: 9.99,
    color: "text-amber-500",
    bgGradient: "from-amber-400 to-orange-500",
    popular: true,
    features: [
      "Unlimited super likes",
      "See who likes you",
      "Priority matching",
      "Advanced filters",
      "Read receipts",
      "Ad-free experience",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    icon: Gem,
    price: 19.99,
    color: "text-purple-500",
    bgGradient: "from-purple-400 to-pink-500",
    features: [
      "All Pro features",
      "Profile boost weekly",
      "Incognito mode",
      "VIP badge on profile",
      "Priority support",
      "Exclusive events access",
    ],
  },
];

interface Product {
  id: string;
  name: string;
  description: string;
  active: boolean;
  metadata: Record<string, string>;
  prices: {
    id: string;
    unit_amount: number;
    currency: string;
    recurring: { interval: string } | null;
    active: boolean;
  }[];
}

export default function Premium() {
  const { data: profile } = useMyProfile();
  const { toast } = useToast();
  const search = useSearch();
  
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast({
        title: "Welcome to Premium!",
        description: "Your subscription is now active.",
      });
    } else if (searchParams.get('canceled') === 'true') {
      toast({
        title: "Checkout canceled",
        description: "Your subscription was not processed.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast]);

  const { data: products, isLoading: productsLoading } = useQuery<{ data: Product[] }>({
    queryKey: ['/api/products'],
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest('POST', '/api/checkout', { priceId });
      return await response.json() as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/customer-portal');
      return await response.json() as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to open billing portal.",
        variant: "destructive",
      });
    },
  });

  const trialDaysLeft = profile?.trialEndsAt 
    ? Math.max(0, differenceInDays(new Date(profile.trialEndsAt), new Date()))
    : 0;

  const isTrialActive = trialDaysLeft > 0;
  const isPremium = profile?.isPremium;
  const currentTier = (profile?.membershipTier || 'free') as MembershipTier;

  const findPriceForTier = (tier: MembershipTier) => {
    const product = products?.data?.find(p => 
      p.metadata?.tier === tier || 
      p.name.toLowerCase().includes(tier)
    );
    return product?.prices?.find(p => p.recurring?.interval === 'month' && p.active);
  };

  const handleSubscribe = (tier: TierInfo) => {
    const price = findPriceForTier(tier.id);
    if (price) {
      checkoutMutation.mutate(price.id);
    } else {
      toast({
        title: "Setup Required",
        description: `${tier.name} subscription is being configured. Please check back soon.`,
      });
    }
  };

  const handleManageSubscription = () => {
    portalMutation.mutate();
  };

  const getCurrentTierInfo = () => {
    return tiers.find(t => t.id === currentTier);
  };

  return (
    <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold mb-2" data-testid="premium-title">Crush Premium</h1>
          <p className="text-muted-foreground">Choose the plan that's right for you</p>
        </div>

        {isPremium && currentTier !== 'free' && (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Badge className="bg-green-500">{getCurrentTierInfo()?.name || 'Premium'} Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                You have full access to all {getCurrentTierInfo()?.name || 'premium'} features
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={handleManageSubscription}
                disabled={portalMutation.isPending}
                data-testid="button-manage-subscription"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Manage Subscription
              </Button>
            </CardContent>
          </Card>
        )}

        {!isPremium && isTrialActive && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="p-4 text-center">
              <Badge variant="secondary" className="mb-2">Free Trial Active</Badge>
              <p className="text-sm text-muted-foreground">
                You have <span className="font-semibold text-foreground">{trialDaysLeft} days</span> left on your free trial
              </p>
            </CardContent>
          </Card>
        )}

        {productsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              const isCurrentTier = currentTier === tier.id;
              const stripePrice = findPriceForTier(tier.id);
              const displayPrice = stripePrice 
                ? (stripePrice.unit_amount / 100).toFixed(2)
                : tier.price.toFixed(2);

              return (
                <Card 
                  key={tier.id} 
                  className={`relative border-none shadow-xl transition-transform hover:scale-[1.02] ${
                    tier.popular ? 'ring-2 ring-primary' : ''
                  } ${isCurrentTier ? 'ring-2 ring-green-500' : ''}`}
                  data-testid={`tier-card-${tier.id}`}
                >
                  {tier.popular && !isCurrentTier && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary shadow-lg">Most Popular</Badge>
                    </div>
                  )}
                  {isCurrentTier && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-green-500 shadow-lg">Current Plan</Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-2 pt-6">
                    <div className={`w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br ${tier.bgGradient} flex items-center justify-center`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <CardTitle className="text-xl">{tier.name}</CardTitle>
                    <div className="flex items-baseline justify-center gap-1 mt-2">
                      <span className="text-3xl font-bold">${displayPrice}</span>
                      <span className="text-muted-foreground text-sm">/month</span>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pb-6">
                    <ul className="space-y-2.5 mb-6">
                      {tier.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div className={`w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                            <Check className="w-2.5 h-2.5 text-green-500" />
                          </div>
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button 
                      className={`w-full rounded-full font-semibold ${
                        tier.popular && !isCurrentTier
                          ? 'shadow-lg shadow-primary/20' 
                          : ''
                      }`}
                      variant={isCurrentTier ? "outline" : tier.popular ? "default" : "secondary"}
                      onClick={() => handleSubscribe(tier)}
                      disabled={checkoutMutation.isPending || isCurrentTier}
                      data-testid={`button-subscribe-${tier.id}`}
                    >
                      {checkoutMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : isCurrentTier ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Current Plan
                        </>
                      ) : (
                        <>
                          <Icon className="w-4 h-4 mr-2" />
                          {isPremium ? 'Switch to ' : 'Get '}{tier.name}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="border-none shadow-lg">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              All plans include a 7-day money-back guarantee. Cancel anytime through your account settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
