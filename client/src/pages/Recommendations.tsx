import { useRecommendedProfiles, useCrushPicks, useSwipe } from "@/hooks/use-dating";
import { Loader2, Sparkles, Star, Heart, X, ShieldCheck, Crown } from "lucide-react";
import { Profile } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { AdBanner } from "@/components/AdBanner";

function ProfilePreviewCard({ profile, onLike }: { profile: Profile; onLike: () => void }) {
  const avatarUrl = profile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`;
  const { mutate: swipe, isPending } = useSwipe();
  const { toast } = useToast();

  const handleSwipe = (liked: boolean) => {
    swipe({ swipedId: profile.userId, liked }, {
      onSuccess: (data) => {
        if (data.match) {
          toast({
            title: "It's a Match!",
            description: `You and ${profile.displayName} liked each other!`,
            className: "bg-gradient-to-r from-pink-500 to-rose-500 text-white border-none",
            duration: 5000,
          });
        }
        queryClient.invalidateQueries({ queryKey: [api.profiles.recommended.path] });
        queryClient.invalidateQueries({ queryKey: [api.profiles.crushPicks.path] });
        onLike();
      }
    });
  };

  return (
    <Card className="group relative overflow-visible hover-elevate cursor-pointer" data-testid={`card-profile-${profile.id}`}>
      <div className="aspect-[3/4] relative overflow-hidden rounded-md">
        <img 
          src={avatarUrl} 
          alt={profile.displayName}
          className="w-full h-full object-cover"
          data-testid={`img-profile-${profile.id}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        
        <div className="absolute top-2 right-2 flex gap-1">
          {profile.isVerified && (
            <Badge variant="secondary" className="bg-blue-500/90 text-white border-none gap-1" data-testid={`badge-verified-${profile.id}`}>
              <ShieldCheck className="w-3 h-3" />
              <span>Verified</span>
            </Badge>
          )}
          {profile.isPremium && (
            <Badge variant="secondary" className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white border-none gap-1" data-testid={`badge-premium-${profile.id}`}>
              <Crown className="w-3 h-3" />
              <span>{profile.membershipTier === 'elite' ? 'Elite' : profile.membershipTier === 'pro' ? 'Pro' : 'Premium'}</span>
            </Badge>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-white text-lg truncate" data-testid={`text-name-${profile.id}`}>
                {profile.displayName}, {profile.age}
              </h3>
              {profile.bio && (
                <p className="text-white/80 text-xs line-clamp-2 mt-0.5" data-testid={`text-bio-${profile.id}`}>{profile.bio}</p>
              )}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Button 
                size="icon" 
                variant="ghost"
                className="rounded-full bg-white/20 border-white/30 text-white"
                onClick={(e) => { e.stopPropagation(); handleSwipe(false); }}
                disabled={isPending}
                data-testid={`button-pass-${profile.id}`}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button 
                size="icon"
                className="rounded-full"
                onClick={(e) => { e.stopPropagation(); handleSwipe(true); }}
                disabled={isPending}
                data-testid={`button-like-${profile.id}`}
              >
                <Heart className="w-4 h-4 fill-current" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {profile.interests && profile.interests.length > 0 && (
        <div className="p-2 flex flex-wrap gap-1">
          {profile.interests.slice(0, 3).map((interest, i) => (
            <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-interest-${profile.id}-${i}`}>
              {interest}
            </Badge>
          ))}
          {profile.interests.length > 3 && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-more-interests-${profile.id}`}>
              +{profile.interests.length - 3}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Recommendations() {
  const { data: recommended, isLoading: loadingRecommended } = useRecommendedProfiles();
  const { data: crushPicks, isLoading: loadingCrushPicks } = useCrushPicks();

  const handleProfileAction = () => {
    queryClient.invalidateQueries({ queryKey: [api.profiles.recommended.path] });
    queryClient.invalidateQueries({ queryKey: [api.profiles.crushPicks.path] });
  };

  if (loadingRecommended || loadingCrushPicks) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center" data-testid="loading-state">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground animate-pulse" data-testid="text-loading">Finding your perfect matches...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 space-y-8" data-testid="page-recommendations">
      
      <section data-testid="section-crush-picks">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center">
            <Star className="w-5 h-5 text-white fill-current" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold" data-testid="heading-crush-picks">Crush Picks</h2>
            <p className="text-sm text-muted-foreground" data-testid="text-crush-picks-subtitle">Handpicked profiles we think you'll love</p>
          </div>
        </div>

        {crushPicks && crushPicks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="grid-crush-picks">
            {crushPicks.map(profile => (
              <ProfilePreviewCard 
                key={profile.id} 
                profile={profile} 
                onLike={handleProfileAction}
              />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center" data-testid="empty-crush-picks">
            <Star className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty-crush-picks">No crush picks available right now. Check back soon!</p>
          </Card>
        )}
      </section>

      {/* Ad Banner between sections */}
      <AdBanner size="leaderboard" className="my-2" />

      <section data-testid="section-recommended">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold" data-testid="heading-recommended">Recommended for You</h2>
            <p className="text-sm text-muted-foreground" data-testid="text-recommended-subtitle">Based on your shared interests</p>
          </div>
        </div>

        {recommended && recommended.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="grid-recommended">
            {recommended.map(profile => (
              <ProfilePreviewCard 
                key={profile.id} 
                profile={profile} 
                onLike={handleProfileAction}
              />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center" data-testid="empty-recommended">
            <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty-recommended">Add more interests to your profile to get personalized recommendations!</p>
          </Card>
        )}
      </section>
    </div>
  );
}
