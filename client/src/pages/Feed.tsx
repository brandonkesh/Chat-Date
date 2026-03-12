import { useFeed, useSwipe, useMyProfile, useHideProfile, useSaveProfile } from "@/hooks/use-dating";
import { ProfileCard } from "@/components/ProfileCard";
import { Button } from "@/components/ui/button";
import { X, Heart, Loader2, Pencil, ShieldCheck, ChevronRight, Video, Flag, EyeOff, Bookmark, Mic, Sparkles, Crown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Profile } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { AdBanner } from "@/components/AdBanner";
import { ReportDialog } from "@/components/ReportDialog";

export default function Feed() {
  const { data: profiles, isLoading, isError } = useFeed();
  const { data: myProfile } = useMyProfile();
  const { mutate: swipe } = useSwipe();
  const { mutate: hideProfile } = useHideProfile();
  const { mutate: saveProfile } = useSaveProfile();
  const { toast } = useToast();
  
  const [reportOpen, setReportOpen] = useState(false);
  
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
      <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground animate-pulse">Finding matches...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center p-6 text-center">
        <div>
          <h3 className="text-xl font-bold mb-2">Something went wrong</h3>
          <p className="text-muted-foreground">Unable to load profiles. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] w-full flex flex-col items-center justify-center p-4 overflow-hidden relative max-w-md mx-auto">
      
      {/* AI Advisor Banner - shown at top */}
      <Link href="/ai-advisor" className="w-full mb-3 block" data-testid="link-ai-advisor-banner">
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

      {/* Verification Banner - shown for unverified users */}
      {myProfile && !myProfile.isVerified && myProfile.verificationStatus !== 'pending' && (
        <Link href="/verification" className="w-full mb-4 block" data-testid="link-verification-banner">
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

      {/* Quick Actions - Fixed at top right */}
      <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
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

      <div className="w-full h-[500px] sm:h-[600px] relative">
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
              <Button onClick={() => window.location.reload()} variant="outline">
                Refresh Feed
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Manual Controls */}
      {stack.length > 0 && (
        <div className="flex items-center gap-6 mt-8">
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
