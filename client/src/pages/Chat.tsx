import { useRoute, useLocation } from "wouter";
import { useMatch, useMessages, useSendMessage, useMyProfile } from "@/hooks/use-dating";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ChevronLeft, Clock, Lock, Video, Flag, Zap, Crown, Sparkles, X, Lightbulb, Copy, Mic, UserX } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { Link } from "wouter";
import { ReportDialog } from "@/components/ReportDialog";
import { VoiceNoteRecorder, VoiceNotePlayer } from "@/components/VoiceNote";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, isPast } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface CoachingData {
  tone: "great" | "good" | "needs_work";
  toneLabel: string;
  suggestions: string[];
  nextMessage: string;
}

function ConversationCoach({
  matchId,
  messages,
  onUseSuggestion,
}: {
  matchId: number;
  messages: any[];
  onUseSuggestion: (text: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const { data: coaching, mutate: fetchCoaching, isPending } = useMutation<CoachingData>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/chat/coach", {
        matchId,
        recentMessages: messages?.slice(-10) || [],
      });
      return res.json();
    },
  });

  const handleOpen = () => {
    setIsOpen(true);
    if (!coaching) {
      fetchCoaching();
    }
  };

  const toneColors: Record<string, string> = {
    great: "text-green-600 dark:text-green-400",
    good: "text-blue-600 dark:text-blue-400",
    needs_work: "text-amber-600 dark:text-amber-400",
  };

  const toneBg: Record<string, string> = {
    great: "bg-green-500/10",
    good: "bg-blue-500/10",
    needs_work: "bg-amber-500/10",
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className="gap-1.5"
        data-testid="button-open-coach"
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-xs">AI Coach</span>
      </Button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="border-t border-border bg-card"
        data-testid="panel-coach"
      >
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-foreground" />
              <span className="text-sm font-medium">Conversation Coach</span>
              {coaching && (
                <Badge
                  variant="secondary"
                  className={`text-xs no-default-hover-elevate no-default-active-elevate ${toneBg[coaching.tone] || ""}`}
                  data-testid="badge-tone"
                >
                  <span className={toneColors[coaching.tone] || ""}>{coaching.toneLabel}</span>
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchCoaching()}
                disabled={isPending}
                data-testid="button-refresh-coach"
              >
                <Sparkles className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                data-testid="button-close-coach"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {isPending ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Getting tips...</span>
            </div>
          ) : coaching ? (
            <div className="space-y-2">
              {coaching.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {coaching.suggestions.map((tip, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
                      <Lightbulb className="w-3 h-3 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                      <span data-testid={`text-coach-tip-${i}`}>{tip}</span>
                    </div>
                  ))}
                </div>
              )}

              {coaching.nextMessage && (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border hover-elevate cursor-pointer text-left"
                  onClick={() => {
                    onUseSuggestion(coaching.nextMessage);
                    toast({ title: "Message suggestion added" });
                  }}
                  data-testid="button-use-suggestion"
                >
                  <span className="flex-1 text-xs" data-testid="text-suggested-message">{coaching.nextMessage}</span>
                  <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              )}
            </div>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function Chat() {
  const [, params] = useRoute("/chat/:id");
  const matchId = parseInt(params?.id || "0");
  
  const { data: profile } = useMyProfile();
  const { data: matchData, isLoading: loadingMatch } = useMatch(matchId);
  const { data: messages, isLoading: loadingMessages } = useMessages(matchId);
  const { mutate: sendMessage, isPending: sending } = useSendMessage(matchId);
  
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [showUnmatchConfirm, setShowUnmatchConfirm] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { mutate: unmatchUser, isPending: unmatching } = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/matches/${matchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Conversation ended", description: "You've unmatched this person." });
      setLocation("/matches");
    },
    onError: () => {
      toast({ title: "Error", description: "Could not end conversation. Please try again.", variant: "destructive" });
    },
  });
  
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: existingMicroDate } = useQuery({
    queryKey: ["/api/micro-dates/match", matchId],
    queryFn: () => fetch(`/api/micro-dates/match/${matchId}`, { credentials: "include" }).then(r => r.json()),
    enabled: matchId > 0,
  });

  const { mutate: inviteMicroDate, isPending: inviting } = useMutation({
    mutationFn: () => apiRequest("POST", "/api/micro-dates/invite", { matchId }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/micro-dates/match", matchId] });
      setLocation(`/micro-date/${data.id}`);
    },
    onError: (err: any) => {
      if (err.message?.includes("already active")) {
        toast({ title: "A micro-date is already in progress", variant: "destructive" });
      } else {
        toast({ title: "Failed to start micro-date", variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setError(null);
    sendMessage(inputValue, {
      onSuccess: () => setInputValue(""),
      onError: (err) => {
        if (err.message.includes("TRIAL_EXPIRED")) {
          setError("Your free trial has ended. Please subscribe to continue chatting.");
        } else {
          setError("Failed to send message");
        }
      }
    });
  };

  if (loadingMatch || !profile) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!matchData) return <div>Match not found</div>;

  const { partnerProfile } = matchData;
  const isTrialExpired = profile.trialEndsAt ? isPast(new Date(profile.trialEndsAt)) : false;

  return (
    <div className="flex flex-col h-screen bg-background max-w-3xl mx-auto border-x border-border shadow-2xl">
      <header className="flex-none p-4 border-b border-border bg-card/80 dark:bg-black/80 backdrop-blur-md flex items-center gap-3 sticky top-0 z-10">
        <Link href="/matches">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        
        <img 
          src={partnerProfile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerProfile.displayName}`} 
          alt={partnerProfile.displayName}
          className="w-10 h-10 rounded-full object-cover bg-secondary"
        />
        
        <div className="flex-1">
          <h2 className="font-bold text-sm md:text-base leading-none mb-1">
            {partnerProfile.displayName}
          </h2>
          <p className="text-xs text-muted-foreground">
            Matched {matchData.match.createdAt ? formatDistanceToNow(new Date(matchData.match.createdAt), { addSuffix: true }) : 'recently'}
          </p>
        </div>
        
        {existingMicroDate?.id ? (
          <Link href={`/micro-date/${existingMicroDate.id}`}>
            <Button variant="ghost" size="icon" data-testid="button-resume-micro-date">
              <Zap className="w-5 h-5" />
            </Button>
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => inviteMicroDate()}
            disabled={inviting}
            data-testid="button-start-micro-date"
          >
            {inviting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
          </Button>
        )}

        {profile?.membershipTier === 'elite' ? (
          <Link href={`/video/${matchId}`}>
            <Button variant="ghost" size="icon" data-testid="button-video-call">
              <Video className="w-5 h-5" />
            </Button>
          </Link>
        ) : (
          <Link href="/premium">
            <Button variant="ghost" size="icon" className="relative" data-testid="button-video-call-locked">
              <Video className="w-5 h-5 text-muted-foreground" />
              <Crown className="w-3 h-3 text-amber-500 absolute -top-0.5 -right-0.5" />
            </Button>
          </Link>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowUnmatchConfirm(true)}
          disabled={unmatching}
          title="End conversation"
          data-testid="button-unmatch"
        >
          <UserX className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setReportOpen(true)}
          data-testid="button-report-user"
        >
          <Flag className="w-5 h-5" />
        </Button>
      </header>

      {showUnmatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowUnmatchConfirm(false)} data-testid="modal-unmatch-confirm">
          <div className="bg-card rounded-lg p-6 max-w-sm mx-4 space-y-4 shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <UserX className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-base">End Conversation?</h3>
                <p className="text-sm text-muted-foreground">
                  This will unmatch you from {partnerProfile.displayName} and delete all messages. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowUnmatchConfirm(false)}
                disabled={unmatching}
                data-testid="button-cancel-unmatch"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => unmatchUser()}
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

      {!isTrialExpired ? (
        <div className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground border-b border-border flex items-center justify-center gap-2">
          <Clock className="w-3 h-3" />
          Trial active until {new Date(profile.trialEndsAt).toLocaleDateString()}
        </div>
      ) : (
        <div className="bg-destructive/10 p-2 text-center text-xs font-medium text-destructive border-b border-destructive/10 flex items-center justify-center gap-2">
          <Lock className="w-3 h-3" />
          Trial Expired
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-secondary/5">
        {loadingMessages ? (
          <div className="flex justify-center p-4">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
              <Send className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-medium">Say hello to {partnerProfile.displayName}!</p>
          </div>
        ) : (
          messages?.map((msg) => {
            const isMe = msg.senderId === profile.userId;
            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id} 
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div 
                  className={`
                    max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm
                    ${isMe 
                      ? "bg-primary text-primary-foreground rounded-tr-none" 
                      : "bg-card dark:bg-zinc-800 text-foreground rounded-tl-none border border-border"
                    }
                  `}
                >
                  {msg.voiceNoteUrl ? (
                    <VoiceNotePlayer
                      url={msg.voiceNoteUrl.startsWith("http") ? msg.voiceNoteUrl : `/objects/${msg.voiceNoteUrl}`}
                      duration={msg.voiceNoteDuration}
                      isMe={isMe}
                    />
                  ) : (
                    <>
                      {msg.content}
                      {msg.isScam && !isMe && (
                        <div 
                          className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] text-destructive flex items-start gap-1.5" 
                          data-testid={`scam-warning-${msg.id}`}
                        >
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-bold uppercase tracking-wider">Potential Scam Detected</p>
                            <p className="opacity-90">{msg.scamAnalysis}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <ConversationCoach
        matchId={matchId}
        messages={messages || []}
        onUseSuggestion={(text) => setInputValue(text)}
      />

      <div className="flex-none p-4 bg-background border-t border-border">
        {error && (
           <div className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex flex-col items-center gap-2 text-center animate-in slide-in-from-bottom-2">
             <p>{error}</p>
             {error.includes("subscribe") && (
               <Button size="sm" variant="destructive" className="w-full">
                 Upgrade to Premium ($9.99/mo)
               </Button>
             )}
           </div>
        )}

        {isRecordingVoice ? (
          <VoiceNoteRecorder
            onSend={(voiceNoteUrl, duration) => {
              setError(null);
              sendMessage(
                { content: "Voice note", voiceNoteUrl, voiceNoteDuration: duration },
                {
                  onSuccess: () => setIsRecordingVoice(false),
                  onError: (err) => {
                    if (err.message.includes("TRIAL_EXPIRED")) {
                      setError("Your free trial has ended. Please subscribe to continue chatting.");
                    } else {
                      setError("Failed to send voice note");
                    }
                    setIsRecordingVoice(false);
                  },
                }
              );
            }}
            onCancel={() => setIsRecordingVoice(false)}
            disabled={sending}
          />
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isTrialExpired ? "Subscription required to chat..." : "Type a message..."}
              className="flex-1"
              disabled={sending || isTrialExpired}
              data-testid="input-message"
            />
            {!inputValue.trim() && !isTrialExpired ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setIsRecordingVoice(true)}
                disabled={sending}
                data-testid="button-start-voice-note"
              >
                <Mic className="w-5 h-5" />
              </Button>
            ) : null}
            <Button 
              type="submit" 
              size="icon" 
              disabled={!inputValue.trim() || sending || isTrialExpired}
              data-testid="button-send"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </form>
        )}
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        reportedUserId={partnerProfile.userId}
        reportedUserName={partnerProfile.displayName}
      />
    </div>
  );
}
