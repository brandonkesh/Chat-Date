import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Trophy, MessageCircle } from "lucide-react";
import { Link } from "wouter";

type LeaderboardEntry = {
  rank: number;
  name1: string;
  name2: string;
  messageCount: number;
};

const RANK_STYLE: Record<number, { emoji: string; ring: string }> = {
  1: { emoji: "🥇", ring: "border-amber-400 bg-amber-400/10" },
  2: { emoji: "🥈", ring: "border-slate-300 bg-slate-300/10" },
  3: { emoji: "🥉", ring: "border-orange-400 bg-orange-400/10" },
};

export default function Leaderboard() {
  const { data, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard"],
  });

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-leaderboard">
      <div className="flex items-center gap-3">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold" data-testid="heading-leaderboard">Couple Leaderboard</h1>
          <p className="text-sm text-muted-foreground">This week's chattiest connections 🔥</p>
        </div>
      </div>

      <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
        <CardContent className="p-5 flex items-center gap-3">
          <Trophy className="w-8 h-8 text-amber-500 shrink-0" />
          <p className="text-sm text-muted-foreground">
            First names only — the top 5 pairs who've exchanged the most messages
            in the last 7 days. Could you two be next? 👀
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-3xl">🦗</p>
            <p className="text-sm text-muted-foreground">
              No chatty couples yet this week. Start a conversation and claim the crown!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((entry) => {
            const style = RANK_STYLE[entry.rank];
            return (
              <Card
                key={entry.rank}
                className={style ? `border ${style.ring}` : ""}
                data-testid={`leaderboard-entry-${entry.rank}`}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">
                    {style?.emoji || `#${entry.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" data-testid={`text-couple-${entry.rank}`}>
                      {entry.name1} & {entry.name2}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {entry.messageCount} messages this week
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
