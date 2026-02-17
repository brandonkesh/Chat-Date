import { useRecommendedProfiles, useCrushPicks, useSwipe } from "@/hooks/use-dating";
import { Loader2, Sparkles, Star, Heart, X, ShieldCheck, Crown, Calendar, Flame, HeartHandshake } from "lucide-react";
import { Profile } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { AdBanner } from "@/components/AdBanner";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface MatchmakingResult {
  profile: Profile;
  compatibilityScore: number;
  matchReasons: string[];
}

interface DailyMatchResponse {
  id: number | null;
  user1Id: string;
  user2Id: string;
  isDailyMatch: boolean;
  createdAt: Date;
  partnerProfile: Profile;
}

function DailyMatchCard() {
  const { data: dailyMatch, isLoading } = useQuery<DailyMatchResponse | null>({
    queryKey: ["/api/matches/daily"],
  });

  if (isLoading || !dailyMatch) return null;

  const profile = dailyMatch.partnerProfile;
  const avatarUrl = profile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`;

  return (
    <section data-testid="section-daily-match">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-blue-500 flex items-center justify-center">
          <Calendar className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Daily Match</h2>
          <p className="text-sm text-muted-foreground">Hand-picked just for you today</p>
        </div>
      </div>

      <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover-elevate transition-all">
        <div className="flex flex-col md:flex-row gap-6 p-6">
          <div className="w-full md:w-48 h-64 relative rounded-xl overflow-hidden shrink-0 shadow-lg">
            <img 
              src={avatarUrl} 
              alt={profile.displayName}
              className="w-full h-full object-cover"
            />
            {profile.isVerified && (
              <Badge className="absolute top-2 right-2 bg-blue-500 text-white border-none">
                <ShieldCheck className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
          
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-2xl font-display font-bold">{profile.displayName}, {profile.age}</h3>
                {profile.isPremium && <Badge className="bg-amber-500 text-white border-none"><Crown className="w-3 h-3" /></Badge>}
              </div>
              <p className="text-muted-foreground mb-4 line-clamp-3">
                {profile.bio || "No bio yet, but we think you'd get along great!"}
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {profile.interests?.slice(0, 4).map((interest, i) => (
                  <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-none">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              {dailyMatch.id ? (
                <Link href={`/chat/${dailyMatch.id}`} className="flex-1">
                  <Button className="w-full rounded-xl text-lg font-semibold gap-2" data-testid="button-daily-chat">
                    <Heart className="w-5 h-5 fill-current" />
                    Start Chatting
                  </Button>
                </Link>
              ) : (
                <DailyMatchActions userId={dailyMatch.user2Id} profileId={profile.id} />
              )}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

function DailyMatchActions({ userId, profileId }: { userId: string; profileId: number }) {
  const { mutate: swipe, isPending } = useSwipe();
  const { toast } = useToast();

  const handleLike = () => {
    swipe({ swipedId: userId, liked: true }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["/api/matches/daily"] });
        if (data.match) {
          toast({
            title: "It's a Match!",
            description: "You matched with your daily pick!",
            className: "bg-gradient-to-r from-primary to-accent text-white border-none",
            duration: 5000,
          });
        } else {
          toast({ title: "Liked!", description: "They'll see your interest." });
        }
      },
    });
  };

  const handlePass = () => {
    swipe({ swipedId: userId, liked: false }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/matches/daily"] });
      },
    });
  };

  return (
    <div className="flex gap-3 flex-1">
      <Button variant="outline" onClick={handlePass} disabled={isPending} className="rounded-xl gap-2" data-testid="button-daily-pass">
        <X className="w-5 h-5" />
        Pass
      </Button>
      <Button onClick={handleLike} disabled={isPending} className="flex-1 rounded-xl text-lg font-semibold gap-2" data-testid="button-daily-like">
        <Heart className="w-5 h-5 fill-current" />
        Like
      </Button>
    </div>
  );
}

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
            className: "bg-gradient-to-r from-primary to-accent text-white border-none",
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

function CompatibilityBadge({ score, profileId }: { score: number; profileId: number }) {
  let color = "bg-muted text-muted-foreground";
  if (score >= 80) color = "bg-green-500/15 text-green-700 dark:text-green-400";
  else if (score >= 60) color = "bg-blue-500/15 text-blue-700 dark:text-blue-400";
  else if (score >= 40) color = "bg-amber-500/15 text-amber-700 dark:text-amber-400";

  return (
    <Badge variant="secondary" className={`${color} border-none gap-1 font-bold`} data-testid={`badge-compat-score-${profileId}`}>
      <Flame className="w-3 h-3" />
      {score}%
    </Badge>
  );
}

function MatchmakingCard({ result, onAction }: { result: MatchmakingResult; onAction: () => void }) {
  const { toast } = useToast();
  const { mutate: swipe, isPending } = useSwipe();
  const profile = result.profile;
  const avatarUrl = profile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`;

  const handleSwipe = (liked: boolean) => {
    swipe({ swipedId: profile.userId, liked }, {
      onSuccess: (data) => {
        if (data.match) {
          toast({
            title: "It's a Match!",
            description: `You and ${profile.displayName} liked each other!`,
            className: "bg-gradient-to-r from-primary to-accent text-white border-none",
            duration: 5000,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/profiles/matchmaking"] });
        onAction();
      }
    });
  };

  return (
    <Card className="overflow-visible hover-elevate" data-testid={`card-matchmaking-${profile.id}`}>
      <div className="flex gap-4 p-4">
        <div className="w-20 h-20 rounded-md overflow-hidden shrink-0 relative">
          <img
            src={avatarUrl}
            alt={profile.displayName}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold truncate" data-testid={`text-matchmaking-name-${profile.id}`}>
              {profile.displayName}, {profile.age}
            </h3>
            <CompatibilityBadge score={result.compatibilityScore} profileId={profile.id} />
            {profile.isVerified && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-none gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span className="sr-only sm:not-sr-only">Verified</span>
              </Badge>
            )}
          </div>
          {result.matchReasons.length > 0 && (
            <div className="flex flex-wrap gap-1" data-testid={`reasons-${profile.id}`}>
              {result.matchReasons.slice(0, 4).map((reason, i) => (
                <Badge key={i} variant="outline" className="text-xs font-normal" data-testid={`badge-reason-${profile.id}-${i}`}>
                  {reason}
                </Badge>
              ))}
            </div>
          )}
          {profile.bio && (
            <p className="text-xs text-muted-foreground line-clamp-1">{profile.bio}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0 justify-center">
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full text-muted-foreground"
            onClick={() => handleSwipe(false)}
            disabled={isPending}
            data-testid={`button-matchmaking-pass-${profile.id}`}
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="rounded-full"
            onClick={() => handleSwipe(true)}
            disabled={isPending}
            data-testid={`button-matchmaking-like-${profile.id}`}
          >
            <Heart className="w-4 h-4 fill-current" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MatchmakingSection() {
  const { data: matchmakingResults, isLoading } = useQuery<MatchmakingResult[]>({
    queryKey: ["/api/profiles/matchmaking"],
  });

  const handleAction = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/profiles/matchmaking"] });
    queryClient.invalidateQueries({ queryKey: [api.profiles.recommended.path] });
    queryClient.invalidateQueries({ queryKey: [api.profiles.crushPicks.path] });
  };

  return (
    <section data-testid="section-matchmaking">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-accent to-orange-500 flex items-center justify-center">
          <HeartHandshake className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold" data-testid="heading-matchmaking">Best Matches</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-matchmaking-subtitle">Based on interests, lifestyle & values</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : matchmakingResults && matchmakingResults.length > 0 ? (
        <div className="space-y-3" data-testid="list-matchmaking">
          {matchmakingResults.map(result => (
            <MatchmakingCard
              key={result.profile.id}
              result={result}
              onAction={handleAction}
            />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center" data-testid="empty-matchmaking">
          <HeartHandshake className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground" data-testid="text-empty-matchmaking">
            Complete your profile with interests, lifestyle, and preferences to find your best matches!
          </p>
          <Link href="/profile/edit">
            <Button variant="outline" className="mt-3" data-testid="button-complete-profile">
              Complete Profile
            </Button>
          </Link>
        </Card>
      )}
    </section>
  );
}

export default function Recommendations() {
  const { data: recommended, isLoading: loadingRecommended } = useRecommendedProfiles();
  const { data: crushPicks, isLoading: loadingCrushPicks } = useCrushPicks();

  const handleProfileAction = () => {
    queryClient.invalidateQueries({ queryKey: [api.profiles.recommended.path] });
    queryClient.invalidateQueries({ queryKey: [api.profiles.crushPicks.path] });
    queryClient.invalidateQueries({ queryKey: ["/api/profiles/matchmaking"] });
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
      
      <DailyMatchCard />

      <MatchmakingSection />

      <AdBanner size="leaderboard" className="my-2" />

      <section data-testid="section-crush-picks">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center">
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

      <section data-testid="section-recommended">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-primary flex items-center justify-center">
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
