import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CalendarHeart, Pencil } from "lucide-react";
import { Link } from "wouter";
import { currentWeeklyQuestion } from "@/lib/weekly";

type WeeklyAnswersResponse = {
  weekKey: string;
  answers: {
    profileId: number;
    isMe: boolean;
    displayName: string;
    photoUrl: string | null;
    answer: string | null;
  }[];
};

export default function WeeklyClub() {
  const { data, isLoading } = useQuery<WeeklyAnswersResponse>({
    queryKey: ["/api/weekly-answers"],
  });
  const question = currentWeeklyQuestion();
  const myAnswer = data?.answers.find((a) => a.isMe);
  const others = data?.answers.filter((a) => !a.isMe) ?? [];

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-weekly-club">
      <div className="flex items-center gap-3">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold" data-testid="heading-weekly-club">Question of the Week Club</h1>
          <p className="text-sm text-muted-foreground">See how everyone answered this week 💬</p>
        </div>
      </div>

      <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <CalendarHeart className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">This week's question</p>
              <p className="font-display font-bold text-lg leading-snug" data-testid="text-weekly-question">
                {question.question}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!myAnswer?.answer && (
        <Card className="border-dashed">
          <CardContent className="p-4 flex items-center gap-3">
            <p className="text-sm flex-1">You haven't answered yet — join the club! ✍️</p>
            <Link href="/profile/edit">
              <Button size="sm" data-testid="button-answer-question">
                <Pencil className="w-4 h-4 mr-1" />
                Answer
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {myAnswer?.answer && (
            <Card className="border-primary/40" data-testid="card-my-answer">
              <CardContent className="p-4 flex items-start gap-3">
                <img
                  src={myAnswer.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myAnswer.displayName}`}
                  alt={myAnswer.displayName}
                  className="w-10 h-10 rounded-full object-cover bg-secondary shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    You <span className="text-xs font-normal text-muted-foreground">({myAnswer.displayName})</span>
                  </p>
                  <p className="text-sm text-foreground/90 mt-0.5">"{myAnswer.answer}"</p>
                </div>
              </CardContent>
            </Card>
          )}

          {others.length === 0 && !myAnswer?.answer ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No answers yet this week. Be the first! 🌟
            </p>
          ) : (
            others.map((a) => (
              <Card key={a.profileId} data-testid={`card-answer-${a.profileId}`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <img
                    src={a.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${a.displayName}`}
                    alt={a.displayName}
                    className="w-10 h-10 rounded-full object-cover bg-secondary shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{a.displayName}</p>
                    <p className="text-sm text-foreground/90 mt-0.5">"{a.answer}"</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
