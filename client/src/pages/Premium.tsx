import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Crown,
  Heart,
  Sparkles,
  Loader2,
  Gem,
  Video,
  Shield,
  Eye,
  Filter,
  Bell,
  Bookmark,
  UserCheck,
  Rocket,
  Lock,
  Gift,
} from "lucide-react";
import { useMyProfile } from "@/hooks/use-dating";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MembershipTier } from "@shared/schema";

interface FeatureItem {
  text: string;
  icon: typeof Check;
  highlight?: boolean;
}

interface TierInfo {
  id: Exclude<MembershipTier, "free">;
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

export default function Premium() {
  const { data: profile } = useMyProfile();
  const { toast } = useToast();

  const currentTier = profile?.membershipTier ?? "elite";

  const selectPlanMutation = useMutation({
    mutationFn: async (tier: TierInfo["id"]) => {
      const res = await apiRequest("POST", "/api/select-plan", { tier });
      return res.json();
    },
    onSuccess: (_data, tier) => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      const name = tiers.find((t) => t.id === tier)?.name ?? tier;
      toast({
        title: `You're on the ${name} plan!`,
        description: "Completely free — enjoy your features.",
      });
    },
    onError: () => {
      toast({
        title: "Couldn't switch plans",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24 md:pb-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-premium-title">
          Pick your plan — they're all free!
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto" data-testid="text-premium-subtitle">
          Choose whichever plan fits you best. Every plan is 100% free — no
          payments, no subscriptions, ever.
        </p>
        <Badge
          className="mt-4 bg-gradient-to-r from-blue-600 to-orange-500 text-white border-0"
          data-testid="badge-free-forever"
        >
          All plans $0 — free forever
        </Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-6 items-start">
        {tiers.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const TierIcon = tier.icon;
          return (
            <Card
              key={tier.id}
              className={`relative overflow-visible ${
                tier.popular ? "border-orange-400 shadow-lg" : ""
              } ${isCurrent ? "ring-2 ring-blue-500" : ""}`}
              data-testid={`card-tier-${tier.id}`}
            >
              {tier.popular && (
                <Badge
                  className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-400 to-orange-600 text-white border-0"
                  data-testid="badge-popular"
                >
                  Most Popular
                </Badge>
              )}
              <CardHeader className="text-center pb-2">
                <div
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br ${tier.bgGradient} mx-auto mb-3`}
                >
                  <TierIcon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold" data-testid={`text-tier-name-${tier.id}`}>
                  {tier.name}
                </h2>
                <p className="text-sm text-muted-foreground">{tier.tagline}</p>
                <div className="mt-3 flex items-baseline justify-center gap-1">
                  <span
                    className="text-3xl font-extrabold"
                    data-testid={`text-tier-price-${tier.id}`}
                  >
                    ${tier.price.toFixed(2)}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{tier.bestFor}</p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Button
                  className="w-full"
                  variant={isCurrent ? "secondary" : tier.popular ? "default" : "outline"}
                  disabled={isCurrent || selectPlanMutation.isPending}
                  onClick={() => selectPlanMutation.mutate(tier.id)}
                  data-testid={`button-select-${tier.id}`}
                >
                  {selectPlanMutation.isPending &&
                  selectPlanMutation.variables === tier.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCurrent ? (
                    "Current plan"
                  ) : (
                    `Choose ${tier.name} — Free`
                  )}
                </Button>

                <ul className="space-y-2">
                  {tier.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm"
                      data-testid={`feature-${tier.id}-${i}`}
                    >
                      <feature.icon
                        className={`w-4 h-4 shrink-0 ${
                          feature.highlight ? tier.color : "text-muted-foreground"
                        }`}
                      />
                      <span className={feature.highlight ? "font-medium" : ""}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="border-t pt-3 space-y-1">
                  {tier.limits.map((limit, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-xs text-muted-foreground"
                      data-testid={`limit-${tier.id}-${i}`}
                    >
                      <span>{limit.label}</span>
                      <span className="font-medium text-foreground">{limit.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p
        className="text-center text-sm text-muted-foreground mt-8"
        data-testid="text-premium-footer"
      >
        Switch plans anytime — everything stays free. 💙
      </p>
    </div>
  );
}
