import { motion, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { type Profile } from "@shared/schema";
import { MapPin, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface ProfileCardProps {
  profile: Profile;
  onSwipe: (direction: "left" | "right") => void;
}

export function ProfileCard({ profile, onSwipe }: ProfileCardProps) {
  const [exitX, setExitX] = useState<number | null>(null);
  
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  
  // Color overlays
  const passOpacity = useTransform(x, [-100, 0], [1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);

  const handleDragEnd = (e: any, info: PanInfo) => {
    if (info.offset.x > 100) {
      setExitX(200);
      onSwipe("right");
    } else if (info.offset.x < -100) {
      setExitX(-200);
      onSwipe("left");
    }
  };

  const imageUrl = profile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`;

  return (
    <motion.div
      style={{ x, rotate, opacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      animate={exitX !== null ? { x: exitX, opacity: 0 } : { x: 0, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="absolute top-0 w-full h-full max-w-sm cursor-grab active:cursor-grabbing rounded-3xl overflow-hidden shadow-2xl bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800"
    >
      {/* "NOPE" Overlay */}
      <motion.div 
        style={{ opacity: passOpacity }}
        className="absolute top-8 right-8 z-20 pointer-events-none"
      >
        <div className="border-4 border-red-500 text-red-500 font-black text-4xl px-4 py-2 rounded -rotate-12 tracking-widest bg-white/20 backdrop-blur-sm">
          NOPE
        </div>
      </motion.div>

      {/* "LIKE" Overlay */}
      <motion.div 
        style={{ opacity: likeOpacity }}
        className="absolute top-8 left-8 z-20 pointer-events-none"
      >
        <div className="border-4 border-green-500 text-green-500 font-black text-4xl px-4 py-2 rounded rotate-12 tracking-widest bg-white/20 backdrop-blur-sm">
          LIKE
        </div>
      </motion.div>

      {/* Image */}
      <div className="h-[75%] w-full bg-muted relative">
        <img 
          src={imageUrl} 
          alt={profile.displayName}
          className="w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      </div>

      {/* Content */}
      <div className="h-[25%] p-6 flex flex-col justify-center bg-white dark:bg-gray-900 relative">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-3xl font-display font-bold text-foreground">
            {profile.displayName}
          </h2>
          <span className="text-xl text-muted-foreground font-medium">
            {profile.age}
          </span>
          {profile.isVerified && (
            <Badge className="bg-blue-500 text-white" title="Verified profile" data-testid="verified-badge">
              <ShieldCheck className="w-3 h-3" />
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <MapPin className="w-3 h-3" />
          <span>{Math.floor(Math.random() * 10) + 1} miles away</span>
        </div>
        
        <p className="text-muted-foreground line-clamp-2 leading-relaxed">
          {profile.bio || "No bio yet..."}
        </p>

        {profile.interests && profile.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2" data-testid="profile-interests">
            {profile.interests.slice(0, 4).map((interest) => (
              <Badge key={interest} variant="secondary" className="text-xs">
                {interest}
              </Badge>
            ))}
            {profile.interests.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{profile.interests.length - 4}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Buttons (Visual only, controls are gestures or buttons below) */}
    </motion.div>
  );
}
