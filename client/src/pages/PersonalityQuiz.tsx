import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Profile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, RefreshCw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BadgeKey =
  | "adventurer"
  | "homebody"
  | "foodie"
  | "creative"
  | "bookworm"
  | "fitness_fan"
  | "music_lover"
  | "comedian"
  | "romantic"
  | "planner";

const BADGE_META: Record<BadgeKey, { emoji: string; label: string }> = {
  adventurer: { emoji: "🌍", label: "Adventurer" },
  homebody: { emoji: "🏠", label: "Homebody" },
  foodie: { emoji: "🍜", label: "Foodie" },
  creative: { emoji: "🎨", label: "Creative" },
  bookworm: { emoji: "📚", label: "Bookworm" },
  fitness_fan: { emoji: "💪", label: "Fitness Fan" },
  music_lover: { emoji: "🎵", label: "Music Lover" },
  comedian: { emoji: "😂", label: "Comedian" },
  romantic: { emoji: "💘", label: "Hopeless Romantic" },
  planner: { emoji: "🗓️", label: "The Planner" },
};

interface QuizAnswer {
  text: string;
  badge: BadgeKey;
}

interface QuizQuestion {
  question: string;
  answers: QuizAnswer[];
}

const QUESTIONS: QuizQuestion[] = [
  {
    question: "Your ideal weekend looks like…",
    answers: [
      { text: "A spontaneous road trip somewhere new", badge: "adventurer" },
      { text: "Cozy on the couch with snacks and a movie", badge: "homebody" },
      { text: "Trying that buzzy new restaurant", badge: "foodie" },
      { text: "Getting lost in a good book", badge: "bookworm" },
    ],
  },
  {
    question: "Pick your happy place:",
    answers: [
      { text: "A mountain trail at sunrise", badge: "adventurer" },
      { text: "An art studio covered in paint", badge: "creative" },
      { text: "The gym, chasing a new PR", badge: "fitness_fan" },
      { text: "Front row at a live concert", badge: "music_lover" },
    ],
  },
  {
    question: "How do your friends describe you?",
    answers: [
      { text: "The one who makes everyone laugh", badge: "comedian" },
      { text: "The hopeless romantic", badge: "romantic" },
      { text: "The one with the color-coded calendar", badge: "planner" },
      { text: "The creative soul", badge: "creative" },
    ],
  },
  {
    question: "Your dream first date is…",
    answers: [
      { text: "A tasting menu at a hidden gem", badge: "foodie" },
      { text: "A candlelit dinner with deep talks", badge: "romantic" },
      { text: "A hike with a picnic view", badge: "adventurer" },
      { text: "A cozy bookstore then coffee", badge: "bookworm" },
    ],
  },
  {
    question: "What's always on your phone?",
    answers: [
      { text: "A playlist for every mood", badge: "music_lover" },
      { text: "A workout tracking app", badge: "fitness_fan" },
      { text: "A meme folder ready to fire", badge: "comedian" },
      { text: "A to-do list and 3 reminders", badge: "planner" },
    ],
  },
  {
    question: "Friday night, no plans. You…",
    answers: [
      { text: "Order in and start a new series", badge: "homebody" },
      { text: "Hit up a new dinner spot", badge: "foodie" },
      { text: "Sketch, write, or make something", badge: "creative" },
      { text: "Text the group to plan tomorrow", badge: "planner" },
    ],
  },
  {
    question: "Which compliment means the most?",
    answers: [
      { text: "\"You're hilarious!\"", badge: "comedian" },
      { text: "\"You're so thoughtful and sweet.\"", badge: "romantic" },
      { text: "\"You're so well-read.\"", badge: "bookworm" },
      { text: "\"You're always up for anything!\"", badge: "adventurer" },
    ],
  },
  {
    question: "Your travel style is…",
    answers: [
      { text: "Backpack and no itinerary", badge: "adventurer" },
      { text: "A spreadsheet planned to the hour", badge: "planner" },
      { text: "Wherever the food scene is best", badge: "foodie" },
      { text: "A quiet cabin to unwind", badge: "homebody" },
    ],
  },
];

export default function PersonalityQuiz() {
  const { toast } = useToast();
  const { data: profile } = useQuery<Profile>({ queryKey: ["/api/profiles/me"] });

  const [current, setCurrent] = useState(0);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [result, setResult] = useState<BadgeKey[] | null>(null);

  const savedBadges = (profile?.personalityBadges ?? []) as string[];

  const { mutate: saveBadges, isPending: saving } = useMutation({
    mutationFn: async (badges: string[]) => {
      await apiRequest("PUT", "/api/profiles/me", { personalityBadges: badges });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({ title: "Badges saved! ✨", description: "Your personality badges are now on your profile." });
    },
    onError: () => {
      toast({ title: "Hmm, that didn't work", description: "Couldn't save your badges. Please try again.", variant: "destructive" });
    },
  });

  const handleAnswer = (badge: BadgeKey) => {
    const nextTally = { ...tally, [badge]: (tally[badge] || 0) + 1 };
    setTally(nextTally);

    if (current + 1 < QUESTIONS.length) {
      setCurrent(current + 1);
    } else {
      const top3 = (Object.entries(nextTally) as [BadgeKey, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key]) => key);
      setResult(top3);
    }
  };

  const restart = () => {
    setCurrent(0);
    setTally({});
    setResult(null);
  };

  const progress = ((current) / QUESTIONS.length) * 100;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 pb-24" data-testid="page-personality-quiz">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-3xl font-display font-bold">Personality Quiz</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Answer a few fun questions and we'll reveal your top personality badges. Show them off on your profile! 🎉
      </p>

      {savedBadges.length > 0 && !result && (
        <Card className="p-4 md:p-6 mb-6" data-testid="card-current-badges">
          <h2 className="font-bold text-lg mb-3">Your current badges</h2>
          <div className="flex flex-wrap gap-2">
            {savedBadges.map((key) => {
              const meta = BADGE_META[key as BadgeKey];
              if (!meta) return null;
              return (
                <Badge key={key} variant="secondary" className="text-sm" data-testid={`badge-current-${key}`}>
                  {meta.emoji} {meta.label}
                </Badge>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground mt-3">Want to switch things up? Take the quiz again below.</p>
        </Card>
      )}

      {!result ? (
        <Card className="p-4 md:p-6" data-testid="card-quiz">
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-muted-foreground" data-testid="text-question-progress">
                Question {current + 1} of {QUESTIONS.length}
              </span>
            </div>
            <Progress value={progress} data-testid="progress-quiz" />
          </div>
          <h2 className="text-xl font-bold mb-4" data-testid="text-question">{QUESTIONS[current].question}</h2>
          <div className="grid gap-3">
            {QUESTIONS[current].answers.map((answer, i) => (
              <Button
                key={i}
                variant="outline"
                className="justify-start h-auto py-3 text-left whitespace-normal"
                onClick={() => handleAnswer(answer.badge)}
                data-testid={`button-answer-${i}`}
              >
                {answer.text}
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-4 md:p-6 text-center" data-testid="card-result">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-2xl font-bold mb-1">Your top badges!</h2>
          <p className="text-muted-foreground mb-5">Here's what makes you, you.</p>
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {result.map((key) => {
              const meta = BADGE_META[key];
              return (
                <div
                  key={key}
                  className="flex flex-col items-center gap-1 rounded-md bg-secondary p-4 min-w-[100px]"
                  data-testid={`result-badge-${key}`}
                >
                  <span className="text-3xl">{meta.emoji}</span>
                  <span className="font-medium text-sm">{meta.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              className="gap-2"
              disabled={saving}
              onClick={() => saveBadges(result)}
              data-testid="button-save-badges"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save to my profile
            </Button>
            <Button variant="outline" className="gap-2" onClick={restart} data-testid="button-retake">
              <RefreshCw className="w-4 h-4" />
              Retake quiz
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
