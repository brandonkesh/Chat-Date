import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Heart, MessageCircle, Sparkles, Zap, Loader2, ExternalLink } from "lucide-react";
import { useMyProfile } from "@/hooks/use-dating";
import { differenceInDays } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSearch } from "wouter";
import { useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

const features = [
  { icon: MessageCircle, title: "Unlimited Messages", description: "Chat with all your matches without limits" },
  { icon: Heart, title: "See Who Likes You", description: "Know who's interested before you swipe" },
  { icon: Zap, title: "Priority Matching", description: "Get seen by more potential matches" },
  { icon: Sparkles, title: "Advanced Filters", description: "Find exactly who you're looking for" },
];

interface Product {
  id: string;
  name: string;
  description: string;
  active: boolean;
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
      const response = await apiRequest('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ priceId }),
      });
      return response as { url: string };
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
      const response = await apiRequest('/api/customer-portal', {
        method: 'POST',
      });
      return response as { url: string };
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

  const premiumProduct = products?.data?.find(p => 
    p.name.toLowerCase().includes('premium') || 
    p.name.toLowerCase().includes('crush')
  );
  const monthlyPrice = premiumProduct?.prices?.find(p => 
    p.recurring?.interval === 'month' && p.active
  );

  const displayPrice = monthlyPrice 
    ? `$${(monthlyPrice.unit_amount / 100).toFixed(2)}`
    : '$9.99';

  const handleSubscribe = () => {
    if (monthlyPrice) {
      checkoutMutation.mutate(monthlyPrice.id);
    } else {
      toast({
        title: "Setup Required",
        description: "Premium subscription is being configured. Please check back soon.",
      });
    }
  };

  const handleManageSubscription = () => {
    portalMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-secondary/30 pt-20 pb-24">
      <div className="max-w-lg mx-auto p-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold mb-2" data-testid="premium-title">Crush Premium</h1>
          <p className="text-muted-foreground">Unlock the full dating experience</p>
        </div>

        {isPremium && (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="p-4 text-center">
              <Badge className="mb-2 bg-green-500">Premium Active</Badge>
              <p className="text-sm text-muted-foreground">
                You have full access to all premium features
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

        <Card className="border-none shadow-xl mb-6">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">Premium Features</CardTitle>
            <CardDescription>Everything you need to find your perfect match</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-4 p-3 rounded-lg bg-secondary/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {!isPremium && (
          <Card className="border-none shadow-xl">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                {productsLoading ? (
                  <div className="flex items-center justify-center h-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-center gap-1 mb-2">
                      <span className="text-4xl font-bold">{displayPrice}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Cancel anytime</p>
                  </>
                )}
              </div>

              <ul className="space-y-3 mb-6">
                {["Unlimited messaging", "See who likes you", "Priority matching", "Ad-free experience"].map((item, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-green-500" />
                    </div>
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>

              <Button 
                className="w-full h-12 rounded-full font-semibold shadow-lg shadow-primary/20"
                onClick={handleSubscribe}
                disabled={checkoutMutation.isPending || productsLoading}
                data-testid="button-subscribe"
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Crown className="w-4 h-4 mr-2" />
                )}
                {isTrialActive ? "Upgrade Now" : "Start Premium"}
              </Button>

              {!isTrialActive && (
                <p className="text-xs text-center text-muted-foreground mt-4">
                  Your free trial has ended. Subscribe to continue messaging.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
