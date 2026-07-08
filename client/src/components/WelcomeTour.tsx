import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, MessageCircle, Sparkles, ShieldCheck, Flame } from "lucide-react";

const TOUR_KEY = "crush-welcome-tour-done";

const steps = [
  {
    icon: Heart,
    color: "from-primary to-blue-500",
    title: "Discover people",
    description:
      "Swipe through profiles on your feed. Tap the heart if you're interested, or the X to pass. You can also save profiles to look at later.",
  },
  {
    icon: MessageCircle,
    color: "from-pink-500 to-accent",
    title: "Match & chat",
    description:
      "When you both like each other, it's a match! Head to your Matches to start chatting. Try the daily icebreaker or the Would You Rather game to break the ice.",
  },
  {
    icon: Sparkles,
    color: "from-purple-500 to-pink-500",
    title: "Get a little help",
    description:
      "Check out Top Picks and For You for people we think you'll click with. The AI Dating Advisor is always there for date ideas and advice.",
  },
  {
    icon: ShieldCheck,
    color: "from-green-500 to-emerald-600",
    title: "Stay safe",
    description:
      "Get verified to build trust, and use Date Check-In to share your date plans with a friend before you meet up. Your safety comes first!",
  },
];

export function WelcomeTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        setOpen(true);
      }
    } catch {
      // localStorage unavailable — skip the tour
    }
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="max-w-sm rounded-2xl" data-testid="dialog-welcome-tour">
        <DialogHeader>
          <div className="flex items-center gap-2 justify-center mb-2">
            <Flame className="w-5 h-5 text-accent fill-current" />
            <span className="font-display font-bold text-primary">Welcome to Crush!</span>
          </div>
          <div className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-r ${current.color} flex items-center justify-center mb-2`}>
            <Icon className="w-8 h-8 text-white" />
          </div>
          <DialogTitle className="text-center" data-testid="text-tour-title">{current.title}</DialogTitle>
          <DialogDescription className="text-center" data-testid="text-tour-description">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1.5 my-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"}`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)} data-testid="button-tour-back">
              Back
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={() => (isLast ? finish() : setStep(step + 1))}
            data-testid="button-tour-next"
          >
            {isLast ? "Let's go! 🔥" : "Next"}
          </Button>
        </div>

        {!isLast && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground mx-auto"
            onClick={finish}
            data-testid="button-tour-skip"
          >
            Skip tour
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
