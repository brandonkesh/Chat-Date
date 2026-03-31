import { motion, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { type Profile } from "@shared/schema";
import { MapPin, ShieldCheck, Briefcase, GraduationCap, Wine, Dumbbell, Dog, Baby, Church, Heart, Users } from "lucide-react";
import { VoiceIntroPlayer } from "@/components/VoiceIntro";
import { IntroVideoModal } from "@/components/IntroVideo";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface ProfileCardProps {
  profile: Profile;
  onSwipe: (direction: "left" | "right") => void;
}

// Helper to format lifestyle values for display
const formatLifestyle = (key: string, value: string | null | undefined): string | null => {
  if (!value) return null;
  const labels: Record<string, Record<string, string>> = {
    education: {
      high_school: "High School",
      some_college: "Some College",
      bachelors: "Bachelor's",
      masters: "Master's",
      doctorate: "Doctorate",
    },
    drinking: {
      never: "Non-drinker",
      socially: "Social drinker",
      regularly: "Regular drinker",
    },
    exercise: {
      never: "Not active",
      sometimes: "Sometimes active",
      active: "Active",
      very_active: "Very active",
    },
    pets: {
      none: "No pets",
      have_dog: "Has dog",
      have_cat: "Has cat",
      have_other: "Has pets",
      want_pets: "Wants pets",
    },
    kids: {
      have_and_want_more: "Has kids, wants more",
      have_and_done: "Has kids",
      want_someday: "Wants kids",
      dont_want: "Doesn't want kids",
      not_sure: "Not sure about kids",
    },
    religion: {
      not_religious: "Not religious",
      spiritual: "Spiritual",
      christian: "Christian",
      jewish: "Jewish",
      muslim: "Muslim",
      hindu: "Hindu",
      buddhist: "Buddhist",
      other: "Religious",
    },
  };
  return labels[key]?.[value] || value;
};

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
      className="absolute top-0 w-full h-full max-w-sm cursor-grab active:cursor-grabbing rounded-3xl overflow-hidden shadow-2xl bg-card border-4 border-border"
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
      <div className="h-[25%] p-6 flex flex-col justify-center bg-card relative">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-3xl font-display font-bold text-foreground">
            {profile.displayName}
          </h2>
          <span className="text-xl text-muted-foreground font-medium flex items-center gap-1">
            {profile.age}
            {profile.ageVerified && (
              <ShieldCheck className="w-4 h-4 text-green-500" title="Age verified" data-testid="badge-age-verified" />
            )}
          </span>
          {profile.isVerified && (
            <Badge className="bg-blue-500 text-white" title="Verified profile" data-testid="verified-badge">
              <ShieldCheck className="w-3 h-3" />
            </Badge>
          )}
          {profile.voiceIntroUrl && (
            <VoiceIntroPlayer voiceIntroUrl={profile.voiceIntroUrl} />
          )}
          {profile.introVideoUrl && (
            <IntroVideoModal introVideoUrl={profile.introVideoUrl} />
          )}
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <MapPin className="w-3 h-3" />
          <span>{Math.floor(Math.random() * 10) + 1} miles away</span>
        </div>
        
        <p className="text-muted-foreground line-clamp-2 leading-relaxed">
          {profile.bio || "No bio yet..."}
        </p>

        {/* What I'm Looking For */}
        {(profile.relationshipGoal || profile.familyPlans || profile.lookingForDescription) && (
          <div className="mt-2 space-y-1" data-testid="section-looking-for">
            <div className="flex items-center gap-1 text-xs font-semibold text-primary/80">
              <Heart className="w-3 h-3" />
              <span>Looking for</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {profile.relationshipGoal && (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary capitalize" data-testid="badge-relationship-goal">
                  {profile.relationshipGoal === "not_sure" ? "Not sure yet" :
                   profile.relationshipGoal === "casual" ? "Something casual" :
                   profile.relationshipGoal === "serious" ? "Serious relationship" :
                   profile.relationshipGoal === "marriage" ? "Marriage" :
                   profile.relationshipGoal}
                </Badge>
              )}
              {profile.familyPlans && (
                <Badge variant="outline" className="text-xs border-muted-foreground/30" data-testid="badge-family-plans">
                  <Users className="w-2.5 h-2.5 mr-1" />
                  {profile.familyPlans === "want_kids" ? "Wants kids" :
                   profile.familyPlans === "dont_want_kids" ? "No kids" :
                   profile.familyPlans === "have_kids" ? "Has kids" :
                   profile.familyPlans === "open_to_kids" ? "Open to kids" :
                   "Not sure about kids"}
                </Badge>
              )}
            </div>
            {profile.lookingForDescription && (
              <p className="text-xs text-muted-foreground line-clamp-2 italic" data-testid="text-looking-for-description">
                "{profile.lookingForDescription}"
              </p>
            )}
          </div>
        )}

        {/* Lifestyle Info */}
        {(profile.jobTitle || profile.education || profile.drinking || profile.exercise || profile.pets || profile.kids || profile.religion) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground" data-testid="lifestyle-info">
            {profile.jobTitle && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                {profile.jobTitle}
                {profile.company && ` at ${profile.company}`}
              </span>
            )}
            {profile.education && (
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3 h-3" />
                {formatLifestyle("education", profile.education)}
              </span>
            )}
            {profile.religion && (
              <span className="flex items-center gap-1">
                <Church className="w-3 h-3" />
                {formatLifestyle("religion", profile.religion)}
              </span>
            )}
            {profile.pets && (
              <span className="flex items-center gap-1">
                <Dog className="w-3 h-3" />
                {formatLifestyle("pets", profile.pets)}
              </span>
            )}
            {profile.kids && (
              <span className="flex items-center gap-1">
                <Baby className="w-3 h-3" />
                {formatLifestyle("kids", profile.kids)}
              </span>
            )}
            {profile.drinking && (
              <span className="flex items-center gap-1">
                <Wine className="w-3 h-3" />
                {formatLifestyle("drinking", profile.drinking)}
              </span>
            )}
            {profile.exercise && (
              <span className="flex items-center gap-1">
                <Dumbbell className="w-3 h-3" />
                {formatLifestyle("exercise", profile.exercise)}
              </span>
            )}
          </div>
        )}

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
