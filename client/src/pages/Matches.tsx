import { useMatches, useMyProfile } from "@/hooks/use-dating";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, UserX, Hand, Clock, Reply, HeartCrack, PartyPopper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

// Anniversary milestone for a match: "1 week", "3 months", ... or null.
function matchMilestone(createdAt: string | Date | null): string | null {
  if (!createdAt) return null;
  const matched = new Date(createdAt);
  const now = new Date();
  const days = Math.floor((now.getTime() - matched.getTime()) / 86400000);
  if (days === 7) return "1 week";
  if (days >= 28 && now.getDate() === matched.getDate()) {
    const months =
      (now.getFullYear() - matched.getFullYear()) * 12 +
      (now.getMonth() - matched.getMonth());
    if (months >= 1) return months === 12 ? "1 year" : `${months} month${months > 1 ? "s" : ""}`;
  }
  return null;
}

export default function Matches() {
  const { data: matches, isLoading } = useMatches();
  const { data: myProfile } = useMyProfile();
  const { toast } = useToast();
  const [confirmMatchId, setConfirmMatchId] = useState<number | null>(null);
  const confirmMatch = matches?.find(m => m.match.id === confirmMatchId);

  const { mutate: unmatchUser, isPending: unmatching } = useMutation({
    mutationFn: async (matchId: number) => {
      await apiRequest("DELETE", `/api/matches/${matchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Conversation ended", description: "You've unmatched this person." });
      setConfirmMatchId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not end conversation. Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <MessageCircle className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-display font-bold mb-2">No matches yet</h2>
        <p className="text-muted-foreground mb-6">Start swiping to find your crush!</p>
        <Link href="/feed" className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity">
          Go to Feed
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 pb-24">
      <h1 className="text-3xl font-display font-bold mb-6">Matches ({matches.length})</h1>
      
      <div className="grid gap-4">
        {matches.map(({ match, partnerProfile, lastMessageAt, lastMessageSenderId }: any) => {
          const noMessages = !lastMessageAt;
          const staleDays = lastMessageAt
            ? (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60 * 24)
            : 0;
          const isStale = !noMessages && staleDays > 3;
          const isYourTurn = !noMessages && !!myProfile && lastMessageSenderId && lastMessageSenderId !== myProfile.userId;
          const matchAgeDays = match.createdAt
            ? (Date.now() - new Date(match.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            : 0;
          const isExpiring = noMessages && matchAgeDays > 5;
          const milestone = matchMilestone(match.createdAt);
          return (
          <div key={match.id} className="group flex items-center gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all">
            <Link href={`/chat/${match.id}`} className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
              <img 
                src={partnerProfile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerProfile.displayName}`} 
                alt={partnerProfile.displayName} 
                className="w-16 h-16 rounded-full object-cover bg-secondary"
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors" data-testid={`text-match-name-${match.id}`}>
                    {partnerProfile.displayName}, {partnerProfile.age}
                  </h3>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {match.createdAt ? formatDistanceToNow(new Date(match.createdAt), { addSuffix: true }) : 'recently'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {isExpiring ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-full px-2.5 py-1" data-testid={`nudge-expiring-${match.id}`}>
                      <HeartCrack className="w-3.5 h-3.5" />
                      This match is fading — say something! 💔
                    </span>
                  ) : noMessages ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full px-2.5 py-1" data-testid={`nudge-say-hi-${match.id}`}>
                      <Hand className="w-3.5 h-3.5" />
                      Say hi 👋 — break the ice!
                    </span>
                  ) : isYourTurn ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full px-2.5 py-1" data-testid={`nudge-your-turn-${match.id}`}>
                      <Reply className="w-3.5 h-3.5" />
                      Your turn — they're waiting! 💬
                    </span>
                  ) : isStale ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full px-2.5 py-1" data-testid={`nudge-stale-${match.id}`}>
                      <Clock className="w-3.5 h-3.5" />
                      It's been a while — send a message!
                    </span>
                  ) : (
                    <p className="text-muted-foreground truncate text-sm">
                      Last message {formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true })}
                    </p>
                  )}
                  {milestone && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pink-600 dark:text-pink-400 bg-pink-500/10 rounded-full px-2.5 py-1" data-testid={`chip-anniversary-${match.id}`}>
                      <PartyPopper className="w-3.5 h-3.5" />
                      {milestone} together 🎉
                    </span>
                  )}
                </div>
              </div>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmMatchId(match.id);
              }}
              title="End conversation"
              data-testid={`button-unmatch-${match.id}`}
            >
              <UserX className="w-5 h-5 text-muted-foreground" />
            </Button>
          </div>
          );
        })}
      </div>

      {confirmMatchId !== null && confirmMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setConfirmMatchId(null)} data-testid="modal-unmatch-confirm">
          <div className="bg-card rounded-lg p-6 max-w-sm mx-4 space-y-4 shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <UserX className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-base">End Conversation?</h3>
                <p className="text-sm text-muted-foreground">
                  This will unmatch you from {confirmMatch.partnerProfile.displayName} and delete all messages. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setConfirmMatchId(null)}
                disabled={unmatching}
                data-testid="button-cancel-unmatch"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => unmatchUser(confirmMatchId)}
                disabled={unmatching}
                data-testid="button-confirm-unmatch"
              >
                {unmatching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                End Conversation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
