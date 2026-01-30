import { useMyProfile } from "@/hooks/use-dating";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useState, useEffect } from "react";

type AdSize = "banner" | "rectangle" | "leaderboard";

interface AdBannerProps {
  size?: AdSize;
  className?: string;
}

const adSizes: Record<AdSize, { width: string; height: string; label: string }> = {
  banner: { width: "w-full", height: "h-16", label: "320x50" },
  rectangle: { width: "w-full max-w-[300px]", height: "h-[250px]", label: "300x250" },
  leaderboard: { width: "w-full", height: "h-24", label: "728x90" },
};

export function AdBanner({ size = "banner", className = "" }: AdBannerProps) {
  const { data: profile } = useMyProfile();
  const [dismissed, setDismissed] = useState(false);
  const [adSlot, setAdSlot] = useState<string>("");

  useEffect(() => {
    const slots = [
      { title: "Find Your Match", subtitle: "Premium dating features", cta: "Try Premium" },
      { title: "Upgrade Today", subtitle: "Unlimited swipes & more", cta: "Go Premium" },
      { title: "Stand Out", subtitle: "Get more matches", cta: "Boost Profile" },
    ];
    const randomSlot = slots[Math.floor(Math.random() * slots.length)];
    setAdSlot(JSON.stringify(randomSlot));
  }, []);

  if (profile?.isPremium || dismissed) {
    return null;
  }

  const sizeConfig = adSizes[size];
  const slot = adSlot ? JSON.parse(adSlot) : { title: "Advertisement", subtitle: "", cta: "" };

  return (
    <Card 
      className={`relative overflow-hidden bg-gradient-to-r from-muted/50 to-muted ${sizeConfig.width} ${sizeConfig.height} ${className}`}
      data-testid="ad-banner"
    >
      <div className="absolute top-1 left-1">
        <Badge variant="secondary" className="text-[10px] px-1 py-0 opacity-60">
          Ad
        </Badge>
      </div>
      
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-1 right-1 p-1 rounded-full hover:bg-background/50 transition-colors"
        data-testid="button-dismiss-ad"
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </button>

      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <p className="font-medium text-sm" data-testid="text-ad-title">{slot.title}</p>
          {slot.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{slot.subtitle}</p>
          )}
          {slot.cta && size !== "banner" && (
            <span className="inline-block mt-2 text-xs font-medium text-primary hover:underline cursor-pointer">
              {slot.cta}
            </span>
          )}
        </div>
      </div>

      <div 
        id={`ad-slot-${size}`} 
        className="hidden"
        data-ad-slot={size}
        data-ad-format="auto"
      />
    </Card>
  );
}

export function InFeedAd({ className = "" }: { className?: string }) {
  const { data: profile } = useMyProfile();

  if (profile?.isPremium) {
    return null;
  }

  return (
    <div className={`py-4 ${className}`} data-testid="in-feed-ad">
      <AdBanner size="rectangle" className="mx-auto" />
    </div>
  );
}
