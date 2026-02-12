import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  ArrowLeft,
  Camera,
  FileText,
  Heart,
  Dumbbell,
  ClipboardList,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Lightbulb,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface FeedbackCategory {
  name: string;
  score: number;
  icon: string;
  feedback: string;
  suggestions: string[];
}

interface ProfileFeedback {
  overallScore: number;
  summary: string;
  categories: FeedbackCategory[];
  topTips: string[];
}

const iconMap: Record<string, typeof Camera> = {
  photo: Camera,
  bio: FileText,
  interests: Heart,
  lifestyle: Dumbbell,
  details: ClipboardList,
  verification: ShieldCheck,
};

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-blue-500" : score >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <div className="relative w-36 h-36 mx-auto" data-testid="score-ring">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
        <circle
          cx="60" cy="60" r="54" fill="none" strokeWidth="8" strokeLinecap="round"
          stroke="currentColor" className={color}
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${color}`} data-testid="text-overall-score">{score}</span>
        <span className="text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}

function CategoryScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-blue-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${score}%`, transition: "width 0.8s ease-out" }}
      />
    </div>
  );
}

function CategoryCard({ category }: { category: FeedbackCategory }) {
  const IconComponent = iconMap[category.icon] || ClipboardList;
  const scoreColor = category.score >= 80 ? "text-green-500" : category.score >= 60 ? "text-blue-500" : category.score >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <Card data-testid={`card-category-${category.icon}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <IconComponent className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-medium text-sm">{category.name}</h3>
              <span className={`text-sm font-bold ${scoreColor}`} data-testid={`text-score-${category.icon}`}>
                {category.score}/100
              </span>
            </div>
            <CategoryScoreBar score={category.score} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid={`text-feedback-${category.icon}`}>{category.feedback}</p>
        {category.suggestions.length > 0 && (
          <div className="space-y-1.5">
            {category.suggestions.map((suggestion, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span data-testid={`text-suggestion-${category.icon}-${i}`}>{suggestion}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfileOptimizer() {
  const { data: feedback, isLoading, isError, refetch, isFetching } = useQuery<ProfileFeedback>({
    queryKey: ["/api/profiles/ai-feedback"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/profiles/ai-feedback"] });
    refetch();
  };

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 space-y-6" data-testid="page-profile-optimizer">
      <div className="flex items-center gap-3">
        <Link href="/preferences">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold" data-testid="heading-profile-optimizer">Profile Optimizer</h1>
          <p className="text-sm text-muted-foreground">AI-powered tips to boost your profile</p>
        </div>
        {feedback && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isFetching}
            data-testid="button-refresh-feedback"
          >
            <RefreshCw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {isLoading || isFetching ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <Sparkles className="w-12 h-12 text-foreground animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium">Analyzing your profile...</p>
            <p className="text-sm text-muted-foreground">Our AI is reviewing your profile to give personalized tips</p>
          </div>
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium">Couldn't analyze your profile</p>
              <p className="text-sm text-muted-foreground mt-1">Something went wrong. Please try again.</p>
            </div>
            <Button onClick={handleRefresh} data-testid="button-retry">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : feedback ? (
        <>
          <Card data-testid="card-overall-score">
            <CardContent className="p-6 space-y-4">
              <ScoreRing score={feedback.overallScore} />
              <div className="text-center space-y-1">
                <h2 className="font-display text-lg font-semibold">Your Profile Score</h2>
                <p className="text-sm text-muted-foreground" data-testid="text-summary">{feedback.summary}</p>
              </div>
            </CardContent>
          </Card>

          {feedback.topTips && feedback.topTips.length > 0 && (
            <Card data-testid="card-top-tips">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-foreground" />
                  <CardTitle className="text-lg">Top Tips</CardTitle>
                </div>
                <CardDescription>Quick wins to improve your profile</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {feedback.topTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/50">
                    <Badge variant="secondary" className="shrink-0 mt-0.5 no-default-hover-elevate no-default-active-elevate">{i + 1}</Badge>
                    <p className="text-sm" data-testid={`text-top-tip-${i}`}>{tip}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold px-1">Detailed Breakdown</h2>
            {feedback.categories.map((category) => (
              <CategoryCard key={category.name} category={category} />
            ))}
          </div>

          <Link href="/profile/edit">
            <Button className="w-full" data-testid="button-edit-profile">
              Edit Profile
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </>
      ) : null}
    </div>
  );
}
