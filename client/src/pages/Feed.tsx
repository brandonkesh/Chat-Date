import { useFeed, useSwipe } from "@/hooks/use-dating";
import { ProfileCard } from "@/components/ProfileCard";
import { Button } from "@/components/ui/button";
import { X, Heart, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Profile } from "@shared/schema";

export default function Feed() {
  const { data: profiles, isLoading, isError } = useFeed();
  const { mutate: swipe } = useSwipe();
  const { toast } = useToast();
  
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
            title: "It's a Match! 🎉",
            description: `You and ${currentProfile.displayName} liked each other!`,
            className: "bg-gradient-to-r from-pink-500 to-rose-500 text-white border-none",
            duration: 5000,
          });
        }
      }
    });
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
              <Button onClick={() => window.location.reload()} variant="outline" className="rounded-full">
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
            size="lg" 
            variant="outline"
            className="w-16 h-16 rounded-full border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 shadow-sm transition-transform active:scale-90"
            onClick={() => handleSwipe("left")}
          >
            <X className="w-8 h-8" />
          </Button>

          <Button 
            size="lg" 
            className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 transition-transform hover:-translate-y-1 active:translate-y-0 active:scale-95 border-none"
            onClick={() => handleSwipe("right")}
          >
            <Heart className="w-8 h-8 fill-current" />
          </Button>
        </div>
      )}
    </div>
  );
}
