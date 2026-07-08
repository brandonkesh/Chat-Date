import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Lightbulb, RefreshCw, Coffee } from "lucide-react";

interface DatingTipsResponse {
  weekKey: string;
  tips: string[];
}

export default function DatingTips() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<DatingTipsResponse>({
    queryKey: ["/api/dating-tips"],
  });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 pb-24" data-testid="page-dating-tips">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-3xl font-display font-bold">💡 This Week's Dating Tips</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Fresh, AI-curated dating advice — a new batch every week to help you shine. ✨
      </p>

      {isLoading ? (
        <Card className="p-10 text-center" data-testid="loading-tips">
          <Coffee className="w-8 h-8 text-primary mx-auto mb-3 animate-pulse" />
          <p className="font-medium">Brewing this week's tips… ☕</p>
          <p className="text-sm text-muted-foreground mt-1">This can take a moment the first time.</p>
        </Card>
      ) : isError ? (
        <Card className="p-8 text-center" data-testid="error-tips">
          <div className="text-3xl mb-3">😅</div>
          <h2 className="font-bold text-lg mb-1">Couldn't load the tips</h2>
          <p className="text-muted-foreground mb-4">
            Something went wrong (or we hit a limit). Give it another try in a moment.
          </p>
          <Button className="gap-2" onClick={() => refetch()} disabled={isFetching} data-testid="button-retry-tips">
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Try again
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {(data?.tips ?? []).map((tip, i) => (
            <Card key={i} className="p-4 flex items-start gap-3" data-testid={`card-tip-${i}`}>
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                {i + 1}
              </div>
              <p className="text-sm leading-relaxed pt-1" data-testid={`text-tip-${i}`}>{tip}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
