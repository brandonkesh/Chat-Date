import { useFeed, useSwipe, useMyProfile, useHideProfile, useSaveProfile } from "@/hooks/use-dating";
import { ProfileCard } from "@/components/ProfileCard";
import { Button } from "@/components/ui/button";
import { X, Heart, Loader2, Pencil, ShieldCheck, ChevronRight, Video, Flag, EyeOff, Bookmark, Mic, Sparkles, Crown, Rocket, RotateCcw, Gift, Flame } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Profile } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { AdBanner } from "@/components/AdBanner";
import { ReportDialog } from "@/components/ReportDialog";
import { WelcomeTour } from "@/components/WelcomeTour";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";

export default function Feed() {
  const { data: profiles, isLoading, isError } = useFeed();
  const { data: myProfile } = useMyProfile();
  const { mutate: swipe } = useSwipe();
  const { mutate: hideProfile } = useHideProfile();
  const { mutate: saveProfile } = useSaveProfile();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [reportOpen, setReportOpen] = useState(false);

  const canBoost = myProfile?.membershipTier === 'pro' || myProfile?.membershipTier === 'elite';
  const boostActive = !!(myProfile?.boostedUntil && new Date(myProfile.boostedUntil) > new Date());

  const { mutate: boost, isPending: boosting } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/boost");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.profiles.me.get.path] });
      toast({
        title: "Boost activated! 🚀",
        description: "Your profile will be shown first for the next 30 minutes.",
        className: "bg-gradient-to-r from-primary to-accent text-white border-none",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Boost",
        description: err.message.includes("already boosted")
          ? "You're already boosted! Enjoy the spotlight ✨"
          : "Couldn't start your boost. Please try again.",
      });
      queryClient.invalidateQueries({ queryKey: [api.profiles.me.get.path] });
    },
  });

  // Daily login reward: claimed today (UTC) already?
  const todayKey = new Date().toISOString().slice(0, 10);
  const claimedToday = !!myProfile?.lastRewardAt &&
    new Date(myProfile.lastRewardAt).toISOString().slice(0, 10) === todayKey;

  const { mutate: claimReward, isPending: claiming } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/daily-reward");
      return res.json();
    },
    onSuccess: (data: { alreadyClaimed: boolean; rewardStreak: number }) => {
      queryClient.invalidateQueries({ queryKey: [api.profiles.me.get.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/top-picks"] });
      if (data.alreadyClaimed) {
        toast({ title: "Already claimed today! ✨", description: `Your streak is ${data.rewardStreak} day${data.rewardStreak === 1 ? "" : "s"} — come back tomorrow!` });
      } else {
        toast({
          title: `Daily reward claimed! 🎁`,
          description: `🔥 ${data.rewardStreak}-day streak! You unlocked an extra Top Pick today.`,
          className: "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-none",
        });
      }
    },
    onError: () => {
      toast({ title: "Hmm, that didn't work", description: "Couldn't claim your reward. Please try again.", variant: "destructive" });
    },
  });

  const handleBoost = () => {
    if (!canBoost) {
      toast({ title: "Profile Boost 🚀", description: "Boost is a Pro & Elite perk. Upgrade to get seen first!" });
      setLocation("/premium");
      return;
    }
    if (boostActive || boosting) return;
    boost();
  };
  
  // Local state to manage the stack of profiles
  // We pop them off locally for instant UI update, then invalidate query on idle
  const [stack, setStack] = useState<Profile[]>([]);

  useEffect(() => {
    if (profiles) {
      setStack(profiles);
    }
  }, [profiles]);

  const handleSwipe = (direction: "left" | "right") => {
    if (stack.length === 0) return;
    
    const currentProfile = stack[0];
    const liked = direction === "right";
    
    // Optimistic update: remove from stack immediately
    setStack(prev => prev.slice(1));
    
    swipe({ swipedId: currentProfile.userId, liked }, {
      onSuccess: (data) => {
        if (data.match) {
          toast({
            title: "It's a Match!",
            description: `You and ${currentProfile.displayName} liked each other!`,
            className: "bg-gradient-to-r from-primary to-accent text-white border-none",
            duration: 5000,
          });
        }
      }
    });
  };

  const handleHide = () => {
    if (stack.length === 0) return;
    const currentProfile = stack[0];
    setStack(prev => prev.slice(1));
    hideProfile(currentProfile.userId);
  };

  const handleSave = () => {
    if (stack.length === 0) return;
    const currentProfile = stack[0];
    saveProfile({ userId: currentProfile.userId, save: true });
  };

  if (isLoading) {
    return (
      <div className="feed-viewport flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground animate-pulse">Finding matches...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="feed-viewport flex items-center justify-center p-6 text-center">
        <div>
          <h3 className="text-xl font-bold mb-2">Something went wrong</h3>
          <p className="text-muted-foreground">Unable to load profiles. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-viewport w-full flex flex-col items-center p-4 pt-3 overflow-y-auto overflow-x-hidden relative max-w-md mx-auto">
      
      {/* AI Advisor Banner - shown at top */}
      <Link href="/ai-advisor" className="w-full mb-3 block shrink-0" data-testid="link-ai-advisor-banner">
        <Card className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-none shadow-lg cursor-pointer hover-elevate" data-testid="card-ai-advisor-banner">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">AI Dating Advisor</p>
              <p className="text-xs text-white/80 truncate">Chat or talk for date ideas & advice</p>
            </div>
            <Sparkles className="w-5 h-5 flex-shrink-0" />
          </div>
        </Card>
      </Link>

      {/* Daily Reward Banner */}
      {myProfile && (
        claimedToday ? (
          <div className="w-full mb-3 shrink-0">
            <Card className="p-3 border-amber-500/30 bg-amber-500/5" data-testid="card-daily-reward-claimed">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" data-testid="text-reward-streak">
                    {myProfile.rewardStreak || 1}-day streak! 🔥
                  </p>
                  <p className="text-xs text-muted-foreground truncate">Reward claimed — extra Top Pick unlocked today</p>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <button
            type="button"
            className="w-full mb-3 block shrink-0 text-left"
            onClick={() => claimReward()}
            disabled={claiming}
            data-testid="button-claim-daily-reward"
          >
            <Card className="p-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-none shadow-lg cursor-pointer hover-elevate" data-testid="card-daily-reward">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  {claiming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Claim your daily reward 🎁</p>
                  <p className="text-xs text-white/80 truncate">
                    {myProfile.rewardStreak ? `Keep your ${myProfile.rewardStreak}-day streak going!` : "Check in daily for an extra Top Pick"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 flex-shrink-0" />
              </div>
            </Card>
          </button>
        )
      )}

      {/* Verification Banner - shown for unverified users */}
      {myProfile && !myProfile.isVerified && myProfile.verificationStatus !== 'pending' && (
        <Link href="/verification" className="w-full mb-4 block shrink-0" data-testid="link-verification-banner">
          <Card className="p-3 bg-gradient-to-r from-primary to-blue-600 text-white border-none shadow-lg cursor-pointer hover-elevate" data-testid="card-verification-banner">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Get verified</p>
                <p className="text-xs text-white/80 truncate">Stand out and build trust with matches</p>
              </div>
              <ChevronRight className="w-5 h-5 flex-shrink-0" />
            </div>
          </Card>
        </Link>
      )}

      <WelcomeTour />

      {/* Quick Actions - Fixed at top right */}
      <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBoost}
          disabled={boosting}
          className={`w-11 h-11 rounded-full backdrop-blur-md shadow-md border hover-elevate relative ${
            boostActive
              ? 'bg-gradient-to-r from-primary to-accent border-transparent'
              : 'bg-card/80 dark:bg-black/80 border-border'
          }`}
          data-testid="button-boost"
          title={boostActive ? "Boost active!" : "Boost your profile"}
        >
          <Rocket className={`w-5 h-5 ${boostActive ? 'text-white' : canBoost ? 'text-primary' : 'text-muted-foreground'}`} />
          {!canBoost && (
            <Crown className="w-3 h-3 text-amber-500 absolute -top-0.5 -right-0.5" />
          )}
        </Button>
        {(() => {
          const canVideo = myProfile?.membershipTier === 'pro' || myProfile?.membershipTier === 'elite';
          return (
            <Link href={canVideo ? "/matches" : "/premium"} data-testid="link-video-chat">
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-11 h-11 rounded-full bg-card/80 dark:bg-black/80 backdrop-blur-md shadow-md border border-border hover-elevate relative"
                data-testid="button-video-chat-home"
              >
                <Video className={`w-5 h-5 ${canVideo ? 'text-primary' : 'text-muted-foreground'}`} />
                {!canVideo && (
                  <Crown className="w-3 h-3 text-amber-500 absolute -top-0.5 -right-0.5" />
                )}
              </Button>
            </Link>
          );
        })()}
        <Link href="/profile/edit" data-testid="link-edit-profile">
          <div className="relative group cursor-pointer">
            <Avatar className="w-11 h-11 border-2 border-primary/20 shadow-md">
              <AvatarImage 
                src={myProfile?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myProfile?.displayName || 'user'}`} 
                alt={myProfile?.displayName || "Your profile"} 
              />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {myProfile?.displayName?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
              <Pencil className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
          </div>
        </Link>
      </div>

      <div className="w-full flex-1 min-h-[340px] max-h-[600px] relative shrink-0 sm:shrink">
        <AnimatePresence>
          {stack.length > 0 ? (
            <ProfileCard 
              key={stack[0].id} 
              profile={stack[0]} 
              onSwipe={handleSwipe} 
            />
          ) : (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-card rounded-3xl border border-dashed border-border"
            >
              <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6">
                <Heart className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-display font-bold mb-2">No more profiles</h3>
              <p className="text-muted-foreground mb-6">You've seen everyone nearby. Check back later for new people!</p>
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                <Button onClick={() => window.location.reload()} variant="outline" data-testid="button-refresh-feed">
                  Refresh Feed
                </Button>
                <Link href="/second-chance">
                  <Button variant="ghost" className="w-full gap-2 text-primary" data-testid="link-second-chance">
                    <RotateCcw className="w-4 h-4" />
                    Review people you passed
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Manual Controls */}
      {stack.length > 0 && (
        <div className="flex items-center gap-4 sm:gap-6 mt-4 sm:mt-6 shrink-0">
          <Button 
            size="icon" 
            variant="outline"
            className="text-red-500"
            onClick={() => handleSwipe("left")}
            data-testid="button-swipe-left"
          >
            <X className="w-6 h-6" />
          </Button>

          <Button 
            size="icon"
            variant="outline"
            className="text-blue-500"
            onClick={handleSave}
            data-testid="button-save-profile"
          >
            <Bookmark className="w-5 h-5 fill-current" />
          </Button>

          <Button 
            size="icon"
            className="bg-green-500 text-white"
            onClick={() => handleSwipe("right")}
            data-testid="button-swipe-right"
          >
            <Heart className="w-6 h-6 fill-current" />
          </Button>

          <Button
            size="icon"
            variant="outline"
            className="text-muted-foreground"
            onClick={handleHide}
            data-testid="button-hide-profile"
          >
            <EyeOff className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            variant="outline"
            onClick={() => setReportOpen(true)}
            data-testid="button-report-feed"
          >
            <Flag className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Ad Banner */}
      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-md mx-auto">
        <AdBanner size="banner" />
      </div>

      {stack.length > 0 && (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          reportedUserId={stack[0].userId}
          reportedUserName={stack[0].displayName}
        />
      )}
    </div>
  );
}
