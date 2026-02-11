import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMyProfile } from "@/hooks/use-dating";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  ChevronLeft,
  Timer,
  Zap,
  MessageCircle,
  Flame,
  ArrowRight,
  Check,
  Clock,
  Sparkles,
  Heart,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MicroDateActivity, Profile } from "@shared/schema";

interface MicroDateResponse {
  id: number;
  microDateId: number;
  activityIndex: number;
  userId: string;
  response: string;
  createdAt: string;
}

interface MicroDateSession {
  id: number;
  matchId: number;
  inviterId: string;
  inviteeId: string;
  status: string;
  activities: string;
  currentActivityIndex: number;
  startedAt: string | null;
  endsAt: string | null;
  createdAt: string;
  responses: MicroDateResponse[];
  inviterProfile: Profile;
  inviteeProfile: Profile;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getActivityIcon(type: string) {
  switch (type) {
    case "icebreaker": return <MessageCircle className="w-4 h-4" />;
    case "would_you_rather": return <Zap className="w-4 h-4" />;
    case "this_or_that": return <Flame className="w-4 h-4" />;
    case "rapid_fire": return <Timer className="w-4 h-4" />;
    case "hot_take": return <Sparkles className="w-4 h-4" />;
    case "word_association": return <MessageCircle className="w-4 h-4" />;
    default: return <Zap className="w-4 h-4" />;
  }
}

function getActivityLabel(type: string) {
  switch (type) {
    case "icebreaker": return "Icebreaker";
    case "would_you_rather": return "Would You Rather";
    case "this_or_that": return "This or That";
    case "rapid_fire": return "Rapid Fire";
    case "hot_take": return "Hot Take";
    case "word_association": return "Word Association";
    default: return "Activity";
  }
}

function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  const percentage = Math.max(0, (remaining / 300) * 100);
  const isLow = remaining <= 60;

  return (
    <div className="flex items-center gap-2" data-testid="timer-countdown">
      <Timer className={`w-5 h-5 ${isLow ? "text-destructive" : "text-primary"}`} />
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isLow ? "bg-destructive" : "bg-primary"}`}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <span className={`text-sm font-bold tabular-nums min-w-[3rem] text-right ${isLow ? "text-destructive" : "text-foreground"}`}>
        {formatTime(remaining)}
      </span>
    </div>
  );
}

function ActivityCard({
  activity,
  activityIndex,
  totalActivities,
  myResponse,
  partnerResponse,
  partnerName,
  onRespond,
  isSubmitting,
  isActive,
}: {
  activity: MicroDateActivity;
  activityIndex: number;
  totalActivities: number;
  myResponse: string | null;
  partnerResponse: string | null;
  partnerName: string;
  onRespond: (response: string) => void;
  isSubmitting: boolean;
  isActive: boolean;
}) {
  const [textInput, setTextInput] = useState("");
  const hasOptions = activity.options && activity.options.length > 0;
  const bothResponded = myResponse !== null && partnerResponse !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            {getActivityIcon(activity.type)}
            {getActivityLabel(activity.type)}
          </Badge>
          <span className="text-xs text-muted-foreground" data-testid={`text-activity-progress-${activityIndex}`}>
            {activityIndex + 1} of {totalActivities}
          </span>
        </div>

        <h3 className="text-lg font-display font-bold leading-snug" data-testid={`text-activity-prompt-${activityIndex}`}>
          {activity.prompt}
        </h3>

        {isActive && !myResponse && (
          <div className="space-y-3">
            {hasOptions ? (
              <div className="grid grid-cols-2 gap-3">
                {activity.options!.map((option, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className="h-auto py-4 text-sm font-medium whitespace-normal"
                    onClick={() => onRespond(option)}
                    disabled={isSubmitting}
                    data-testid={`button-option-${activityIndex}-${i}`}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (textInput.trim()) {
                    onRespond(textInput.trim());
                    setTextInput("");
                  }
                }}
                className="flex gap-2"
              >
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type your answer..."
                  className="flex-1"
                  disabled={isSubmitting}
                  data-testid={`input-response-${activityIndex}`}
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={!textInput.trim() || isSubmitting}
                  data-testid={`button-submit-response-${activityIndex}`}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                </Button>
              </form>
            )}
          </div>
        )}

        {myResponse && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 p-3 rounded-md bg-primary/10 border border-primary/20">
                <p className="text-xs font-medium text-muted-foreground mb-1">Your answer</p>
                <p className="text-sm font-medium" data-testid={`text-my-response-${activityIndex}`}>{myResponse}</p>
              </div>
            </div>

            {partnerResponse ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3"
              >
                <div className="flex-1 p-3 rounded-md bg-secondary">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{partnerName}'s answer</p>
                  <p className="text-sm font-medium" data-testid={`text-partner-response-${activityIndex}`}>{partnerResponse}</p>
                </div>
              </motion.div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 rounded-md bg-secondary/50">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for {partnerName}...
              </div>
            )}

            {bothResponded && myResponse === partnerResponse && hasOptions && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-center"
              >
                <Badge variant="secondary" className="bg-green-500/15 text-green-700 dark:text-green-400 border-none gap-1">
                  <Heart className="w-3 h-3" />
                  You matched on this one!
                </Badge>
              </motion.div>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function CompletedView({ session }: { session: MicroDateSession }) {
  const { data: profile } = useMyProfile();
  const activities: MicroDateActivity[] = JSON.parse(session.activities);
  const isInviter = profile?.userId === session.inviterId;
  const partner = isInviter ? session.inviteeProfile : session.inviterProfile;
  const myUserId = profile?.userId;

  const matchCount = activities.reduce((count, activity, idx) => {
    if (!activity.options || activity.options.length === 0) return count;
    const myResp = session.responses.find(r => r.activityIndex === idx && r.userId === myUserId);
    const partnerResp = session.responses.find(r => r.activityIndex === idx && r.userId !== myUserId);
    if (myResp && partnerResp && myResp.response === partnerResp.response) return count + 1;
    return count;
  }, 0);

  const optionActivities = activities.filter(a => a.options && a.options.length > 0).length;

  return (
    <div className="space-y-6">
      <Card className="p-6 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-display font-bold" data-testid="text-micro-date-complete">Micro-Date Complete!</h2>
        <p className="text-muted-foreground text-sm">
          You and {partner?.displayName} completed all {activities.length} activities
        </p>
        {optionActivities > 0 && (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
            {matchCount} of {optionActivities} answers matched
          </Badge>
        )}
      </Card>

      <div className="space-y-3">
        <h3 className="font-display font-bold text-sm text-muted-foreground px-1">Recap</h3>
        {activities.map((activity, idx) => {
          const myResp = session.responses.find(r => r.activityIndex === idx && r.userId === myUserId);
          const partnerResp = session.responses.find(r => r.activityIndex === idx && r.userId !== myUserId);

          return (
            <Card key={idx} className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 text-xs">
                  {getActivityIcon(activity.type)}
                  {getActivityLabel(activity.type)}
                </Badge>
              </div>
              <p className="text-sm font-medium">{activity.prompt}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-md bg-primary/10 text-sm">
                  <span className="text-xs text-muted-foreground block">You</span>
                  {myResp?.response || "—"}
                </div>
                <div className="p-2 rounded-md bg-secondary text-sm">
                  <span className="text-xs text-muted-foreground block">{partner?.displayName}</span>
                  {partnerResp?.response || "—"}
                </div>
              </div>
              {myResp && partnerResp && myResp.response === partnerResp.response && activity.options && (
                <div className="flex justify-center">
                  <Badge variant="secondary" className="bg-green-500/15 text-green-700 dark:text-green-400 border-none gap-1 text-xs">
                    <Check className="w-3 h-3" /> Match
                  </Badge>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Link href={`/chat/${session.matchId}`} className="flex-1">
          <Button className="w-full" data-testid="button-back-to-chat">
            <MessageCircle className="w-4 h-4 mr-2" />
            Back to Chat
          </Button>
        </Link>
      </div>
    </div>
  );
}

function PendingInviteView({
  session,
  isInviter,
}: {
  session: MicroDateSession;
  isInviter: boolean;
}) {
  const partner = isInviter ? session.inviteeProfile : session.inviterProfile;

  const { mutate: accept, isPending: accepting } = useMutation({
    mutationFn: () => apiRequest("POST", `/api/micro-dates/${session.id}/accept`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/micro-dates", session.id] }),
  });

  const { mutate: decline, isPending: declining } = useMutation({
    mutationFn: () => apiRequest("POST", `/api/micro-dates/${session.id}/decline`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/micro-dates", session.id] }),
  });

  return (
    <Card className="p-6 text-center space-y-5">
      <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
        <Zap className="w-10 h-10 text-primary" />
      </div>

      <div>
        <h2 className="text-xl font-display font-bold mb-2" data-testid="text-micro-date-title">
          {isInviter ? "Invitation Sent" : "Micro-Date Invitation"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {isInviter
            ? `Waiting for ${partner?.displayName} to accept your micro-date invitation...`
            : `${partner?.displayName} wants to go on a 5-minute micro-date with you!`}
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 p-4 rounded-md bg-secondary/50">
        <Avatar className="w-12 h-12">
          <AvatarImage
            src={partner?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partner?.displayName}`}
            alt={partner?.displayName}
          />
          <AvatarFallback>{partner?.displayName?.[0]}</AvatarFallback>
        </Avatar>
        <div className="text-left">
          <p className="font-bold text-sm">{partner?.displayName}</p>
          <p className="text-xs text-muted-foreground">{partner?.age} years old</p>
        </div>
      </div>

      <div className="space-y-2 text-left text-sm text-muted-foreground">
        <p className="font-medium text-foreground">What to expect:</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2"><Clock className="w-3 h-3" /> 5 minutes of fun activities</li>
          <li className="flex items-center gap-2"><MessageCircle className="w-3 h-3" /> Icebreakers & rapid-fire questions</li>
          <li className="flex items-center gap-2"><Zap className="w-3 h-3" /> Mini games like "Would You Rather"</li>
          <li className="flex items-center gap-2"><Heart className="w-3 h-3" /> See how your answers compare</li>
        </ul>
      </div>

      {!isInviter && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => decline()}
            disabled={declining || accepting}
            data-testid="button-decline-micro-date"
          >
            {declining ? <Loader2 className="w-4 h-4 animate-spin" /> : "Decline"}
          </Button>
          <Button
            className="flex-1"
            onClick={() => accept()}
            disabled={accepting || declining}
            data-testid="button-accept-micro-date"
          >
            {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Let's Go!"}
          </Button>
        </div>
      )}

      {isInviter && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for response...
        </div>
      )}
    </Card>
  );
}

function ActiveDateView({ session }: { session: MicroDateSession }) {
  const { data: profile } = useMyProfile();
  const [currentIdx, setCurrentIdx] = useState(0);
  const activities: MicroDateActivity[] = JSON.parse(session.activities);
  const isInviter = profile?.userId === session.inviterId;
  const partner = isInviter ? session.inviteeProfile : session.inviterProfile;
  const myUserId = profile?.userId;
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myResponse = session.responses.find(
    (r) => r.activityIndex === currentIdx && r.userId === myUserId
  )?.response ?? null;

  const partnerResponse = session.responses.find(
    (r) => r.activityIndex === currentIdx && r.userId !== myUserId
  )?.response ?? null;

  const { mutate: respond, isPending: isSubmitting } = useMutation({
    mutationFn: (data: { activityIndex: number; response: string }) =>
      apiRequest("POST", `/api/micro-dates/${session.id}/respond`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/micro-dates", session.id] });
    },
  });

  const bothResponded = myResponse !== null && partnerResponse !== null;

  useEffect(() => {
    if (bothResponded && currentIdx < activities.length - 1) {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = setTimeout(() => {
        setCurrentIdx((prev) => Math.min(prev + 1, activities.length - 1));
      }, 2500);
    }
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, [bothResponded, currentIdx, activities.length]);

  const handleRespond = useCallback(
    (response: string) => {
      respond({ activityIndex: currentIdx, response });
    },
    [currentIdx, respond]
  );

  const handleSkip = () => {
    if (currentIdx < activities.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    }
  };

  const currentActivity = activities[currentIdx];
  if (!currentActivity) return null;

  return (
    <div className="space-y-4">
      <CountdownTimer endsAt={session.endsAt!} />

      <div className="flex gap-1 px-1">
        {activities.map((_, idx) => {
          const myResp = session.responses.find(r => r.activityIndex === idx && r.userId === myUserId);
          const partnerResp = session.responses.find(r => r.activityIndex === idx && r.userId !== myUserId);
          const isComplete = !!myResp && !!partnerResp;
          const isCurrent = idx === currentIdx;

          return (
            <button
              key={idx}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                isCurrent ? "bg-primary" : isComplete ? "bg-primary/40" : "bg-secondary"
              }`}
              onClick={() => setCurrentIdx(idx)}
              data-testid={`button-activity-dot-${idx}`}
            />
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <ActivityCard
          key={currentIdx}
          activity={currentActivity}
          activityIndex={currentIdx}
          totalActivities={activities.length}
          myResponse={myResponse}
          partnerResponse={partnerResponse}
          partnerName={partner?.displayName || "Partner"}
          onRespond={handleRespond}
          isSubmitting={isSubmitting}
          isActive
        />
      </AnimatePresence>

      <div className="flex justify-between items-center px-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
          data-testid="button-prev-activity"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>

        {currentIdx < activities.length - 1 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            data-testid="button-next-activity"
          >
            {myResponse ? "Next" : "Skip"} <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          myResponse && (
            <CompleteButton sessionId={session.id} matchId={session.matchId} />
          )
        )}
      </div>
    </div>
  );
}

function CompleteButton({ sessionId, matchId }: { sessionId: number; matchId: number }) {
  const { mutate: complete, isPending } = useMutation({
    mutationFn: () => apiRequest("POST", `/api/micro-dates/${sessionId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/micro-dates", sessionId] });
    },
  });

  return (
    <Button
      size="sm"
      onClick={() => complete()}
      disabled={isPending}
      data-testid="button-finish-micro-date"
    >
      {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
      Finish
    </Button>
  );
}

export default function MicroDate() {
  const [, params] = useRoute("/micro-date/:id");
  const microDateId = parseInt(params?.id || "0");
  const { data: profile } = useMyProfile();

  const { data: session, isLoading } = useQuery<MicroDateSession>({
    queryKey: ["/api/micro-dates", microDateId],
    queryFn: () => fetch(`/api/micro-dates/${microDateId}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      if (data.status === "active") return 3000;
      if (data.status === "pending") return 5000;
      return false;
    },
    enabled: microDateId > 0,
  });

  if (isLoading || !profile) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!session || !session.id) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground mb-4">Micro-date not found</p>
        <Link href="/matches">
          <Button variant="outline" data-testid="button-back-matches">Back to Matches</Button>
        </Link>
      </div>
    );
  }

  const isInviter = profile.userId === session.inviterId;
  const partner = isInviter ? session.inviteeProfile : session.inviterProfile;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto border-x border-border shadow-2xl">
      <header className="flex items-center gap-3 p-4 border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <Link href={`/chat/${session.matchId}`}>
          <Button variant="ghost" size="icon" data-testid="button-back-to-chat-header">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="w-8 h-8">
            <AvatarImage
              src={partner?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partner?.displayName}`}
              alt={partner?.displayName}
            />
            <AvatarFallback>{partner?.displayName?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display font-bold text-sm" data-testid="text-micro-date-partner-name">
              Micro-Date with {partner?.displayName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {session.status === "active" ? "In progress" :
               session.status === "pending" ? "Awaiting response" :
               session.status === "completed" ? "Completed" : session.status}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Zap className="w-3 h-3" />
          5 min
        </Badge>
      </header>

      <div className="p-4 pb-24">
        {session.status === "pending" && (
          <PendingInviteView session={session} isInviter={isInviter} />
        )}

        {session.status === "active" && (
          <ActiveDateView session={session} />
        )}

        {(session.status === "completed" || session.status === "expired") && (
          <CompletedView session={session} />
        )}

        {session.status === "declined" && (
          <Card className="p-6 text-center space-y-4">
            <p className="text-muted-foreground">
              {isInviter
                ? `${partner?.displayName} declined the micro-date invitation.`
                : "You declined this micro-date invitation."}
            </p>
            <Link href={`/chat/${session.matchId}`}>
              <Button variant="outline" data-testid="button-back-to-chat-declined">
                Back to Chat
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
