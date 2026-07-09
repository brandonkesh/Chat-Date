import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Heart, MessageCircle, Sparkles, Zap, Loader2, ExternalLink, Star, Gem, Video, Shield, Eye, Filter, Bell, Mic, Bookmark, UserCheck, Rocket, Lock, Gift } from "lucide-react";
import { useMyProfile } from "@/hooks/use-dating";
import { differenceInDays } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSearch } from "wouter";
import { useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { MembershipTier } from "@shared/schema";

interface FeatureItem {
  text: string;
  icon: typeof Check;
  highlight?: boolean;
}

interface TierInfo {
  id: MembershipTier;
  name: string;
  icon: typeof Crown;
  price: number;
  color: string;
  bgGradient: string;
  tagline: string;
  bestFor: string;
  features: FeatureItem[];
  limits: { label: string; value: string }[];
  popular?: boolean;
}

const tiers: TierInfo[] = [
  {
    id: "basic",
    name: "Basic",
    icon: Heart,
    price: 4.99,
    color: "text-blue-500",
    bgGradient: "from-blue-400 to-blue-500",
    tagline: "Start meeting people",
    bestFor: "Casual daters just getting started",
    features: [
      { text: "10 super likes per day", icon: Heart },
      { text: "See who viewed your profile", icon: Eye },
      { text: "Basic search filters", icon: Filter },
      { text: "Ad-free experience", icon: Shield },
      { text: "Save profiles for later", icon: Bookmark },
      { text: "AI chat advisor", icon: Sparkles },
    ],
    limits: [
      { label: "Daily likes", value: "Unlimited" },
      { label: "Super likes / day", value: "10" },
      { label: "Profile boosts / month", value: "1" },
      { label: "Message history", value: "30 days" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    icon: Crown,
    price: 9.99,
    color: "text-orange-500",
    bgGradient: "from-orange-400 to-orange-600",
    popular: true,
    tagline: "Maximize your matches",
    bestFor: "Active daters who want better results",
    features: [
      { text: "Unlimited super likes", icon: Heart, highlight: true },
      { text: "See everyone who likes you", icon: Eye, highlight: true },
      { text: "Priority matching algorithm", icon: Rocket, highlight: true },
      { text: "Advanced filters (age, distance, lifestyle)", icon: Filter },
      { text: "Read receipts on messages", icon: Bell },
      { text: "Voice & video calls", icon: Video },
      { text: "AI chat advisor", icon: Sparkles },
      { text: "AI photo match", icon: Sparkles, highlight: true },
      { text: "Ad-free experience", icon: Shield },
    ],
    limits: [
      { label: "Daily likes", value: "Unlimited" },
      { label: "Super likes / day", value: "Unlimited" },
      { label: "Profile boosts / month", value: "3" },
      { label: "Message history", value: "Unlimited" },
    ],
  },
  {
    id: "elite",
    name: "Elite",
    icon: Gem,
    price: 19.99,
    color: "text-blue-600",
    bgGradient: "from-blue-600 to-orange-500",
    tagline: "The complete experience",
    bestFor: "Serious daters who want every advantage",
    features: [
      { text: "Everything in Pro", icon: Check, highlight: true },
      { text: "AI chat advisor", icon: Sparkles, highlight: true },
      { text: "AI photo match", icon: Sparkles, highlight: true },
      { text: "Weekly profile boost", icon: Rocket, highlight: true },
      { text: "Incognito mode — browse privately", icon: Lock, highlight: true },
      { text: "VIP badge on your profile", icon: UserCheck, highlight: true },
      { text: "AI profile optimizer", icon: Sparkles },
      { text: "Voice & video calls", icon: Video },
      { text: "Priority customer support", icon: Shield },
      { text: "Exclusive member events", icon: Gift },
    ],
    limits: [
      { label: "Daily likes", value: "Unlimited" },
      { label: "Super likes / day", value: "Unlimited" },
      { label: "Profile boosts / month", value: "4 (weekly)" },
      { label: "Message history", value: "Unlimited" },
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
      return await response.json() as { url?: string; error?: string };
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Error",
          description: data.error ?? "Failed to start checkout. Please try again.",
          variant: "destructive",
        });
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

  const downgradeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/select-plan', { tier: 'free' });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profiles/me'] });
      toast({
        title: "Plan updated",
        description: "You have been switched to the free plan.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update your plan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/customer-portal');
      return await response.json() as { url: string; canceled?: boolean };
    },
    onSuccess: (data) => {
      if (data.canceled) {
        toast({
          title: "Subscription canceled",
          description: "Your premium access has been removed.",
        });
        if (data.url) {
          window.location.href = data.url;
        }
      } else if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
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

  const handleSubscribe = (tier: TierInfo) => {
    if (tier.id === 'free') {
      downgradeMutation.mutate();
      return;
    }
    const product = products?.data.find(
      (p) => p.metadata?.tier === tier.id,
    );
    const priceId = product?.prices?.[0]?.id;
    if (!priceId) {
      toast({
        title: "Error",
        description: "Plan not available right now. Please try again later.",
        variant: "destructive",
      });
      return;
    }
    checkoutMutation.mutate(priceId);
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
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
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
                Cancel Subscription
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
                    <div className={`w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br ${tier.bgGradient} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <CardTitle className="text-xl">{tier.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">{tier.tagline}</p>
                    <div className="flex items-baseline justify-center gap-1 mt-3">
                      <span className="text-3xl font-bold">${tier.price.toFixed(2)}</span>
                      <span className="text-muted-foreground text-sm">/month</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Best for: {tier.bestFor}</p>
                  </CardHeader>
                  
                  <CardContent className="pb-6">
                    <ul className="space-y-2 mb-5">
                      {tier.features.map((feature, index) => {
                        const FeatIcon = feature.icon;
                        return (
                          <li key={index} className={`flex items-start gap-2 ${feature.highlight ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${feature.highlight ? 'bg-primary/10' : 'bg-green-500/10'}`}>
                              <FeatIcon className={`w-2.5 h-2.5 ${feature.highlight ? 'text-primary' : 'text-green-500'}`} />
                            </div>
                            <span className="text-sm leading-tight">{feature.text}</span>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="rounded-lg bg-muted/50 border border-border p-3 mb-5 space-y-1.5">
                      {tier.limits.map((limit, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{limit.label}</span>
                          <span className="font-semibold text-foreground">{limit.value}</span>
                        </div>
                      ))}
                    </div>

                    <Button 
                      className={`w-full rounded-full font-semibold ${
                        tier.popular && !isCurrentTier
                          ? 'shadow-lg shadow-primary/20' 
                          : ''
                      }`}
                      variant={isCurrentTier ? "outline" : tier.popular ? "default" : "secondary"}
                      onClick={() => handleSubscribe(tier)}
                      disabled={checkoutMutation.isPending || downgradeMutation.isPending || isCurrentTier}
                      data-testid={`button-subscribe-${tier.id}`}
                    >
                      {(checkoutMutation.isPending || downgradeMutation.isPending) ? (
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
              Subscriptions are billed monthly via PayPal. Cancel anytime from your subscription settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
