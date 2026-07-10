import { useRoute, useLocation } from "wouter";
import { useMatch, useMessages, useSendMessage, useMyProfile } from "@/hooks/use-dating";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ChevronLeft, Clock, Lock, Video, Flag, Zap, Sparkles, X, Lightbulb, Copy, Mic, UserX, Phone, PhoneOff, AlertTriangle, Crown, Dices, Gamepad2, Drama, Clapperboard, CalendarHeart, PartyPopper, BadgeCheck, HeartHandshake, Trophy } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { Link } from "wouter";
import { ReportDialog } from "@/components/ReportDialog";
import { VoiceNoteRecorder, VoiceNotePlayer } from "@/components/VoiceNote";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, isPast } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const ICEBREAKERS = [
  "What's the best trip you've ever taken?",
  "What's a small thing that instantly makes your day better?",
  "If you could have dinner with anyone, living or not, who would it be?",
  "What's your go-to comfort food?",
  "What's something you're weirdly good at?",
  "What song do you have on repeat right now?",
  "What's the most spontaneous thing you've ever done?",
  "Coffee or tea — and how do you take it?",
  "What's a hobby you've always wanted to try?",
  "What's your idea of a perfect Sunday?",
  "What's the last show you binge-watched?",
  "If you won the lottery tomorrow, what's the first thing you'd do?",
  "What's a food opinion you'll defend forever?",
  "What's your hidden talent?",
  "Beach vacation or mountain getaway?",
  "What's the best piece of advice you've ever gotten?",
  "What did you want to be when you were a kid?",
  "What's something that always makes you laugh?",
  "If you could live anywhere for a year, where would it be?",
  "What's your favorite way to unwind after a long day?",
];

const WYR_PAIRS: [string, string][] = [
  ["always have to sing instead of speak", "dance everywhere you walk"],
  ["travel to the past", "travel to the future"],
  ["have a personal chef", "have a personal driver"],
  ["never use social media again", "never watch another movie"],
  ["be able to fly", "be able to read minds"],
  ["live by the beach", "live in the mountains"],
  ["always be 10 minutes late", "always be 2 hours early"],
  ["give up pizza forever", "give up coffee forever"],
  ["have a rewind button for your life", "have a pause button"],
  ["be famous", "be the best friend of someone famous"],
  ["only eat breakfast food", "only eat dinner food"],
  ["speak every language", "play every instrument"],
];

const WYR_PREFIX = "🎲 Would you rather ";
const TTAL_PREFIX = "🎭 Two Truths and a Lie:";
const EMOJI_STORY_PREFIX = "🎬 Emoji Story: ";

// Simple deterministic hash so both people in a match see the same
// icebreaker question on any given day.
function dailyHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function IcebreakerBanner({
  matchId,
  onAsk,
  disabled,
}: {
  matchId: number;
  onAsk: (text: string) => void;
  disabled: boolean;
}) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const storageKey = `crush-icebreaker-${matchId}-${dateKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const question = ICEBREAKERS[dailyHash(`${matchId}-${dateKey}`) % ICEBREAKERS.length];

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="flex-none px-4 py-2.5 bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border flex items-center gap-2.5" data-testid="banner-icebreaker">
      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today's icebreaker</p>
        <p className="text-xs font-medium truncate" data-testid="text-icebreaker-question">{question}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0"
        disabled={disabled}
        onClick={() => {
          onAsk(`💡 ${question}`);
          dismiss();
        }}
        data-testid="button-ask-icebreaker"
      >
        Ask it
      </Button>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0" data-testid="button-dismiss-icebreaker">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Celebrates conversation milestones (message counts). Tracked per match in
// localStorage so each milestone only pops up once.
const MESSAGE_MILESTONES = [10, 25, 50, 100, 250, 500];

function MilestoneBanner({
  matchId,
  messageCount,
  onCelebrate,
  disabled,
}: {
  matchId: number;
  messageCount: number;
  onCelebrate: (text: string) => void;
  disabled: boolean;
}) {
  const reached = [...MESSAGE_MILESTONES].reverse().find((m) => messageCount >= m);
  const storageKey = `crush-msg-milestone-${matchId}-${reached}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  });

  if (!reached || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="flex-none px-4 py-2.5 bg-gradient-to-r from-amber-500/10 to-primary/10 border-b border-border flex items-center gap-2.5" data-testid="banner-milestone">
      <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Milestone unlocked</p>
        <p className="text-xs font-medium truncate" data-testid="text-milestone">
          {reached}+ messages together! You two are on a roll 🎉
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0"
        disabled={disabled}
        onClick={() => {
          onCelebrate(`🏆 We just hit ${reached} messages together! 🎉`);
          dismiss();
        }}
        data-testid="button-celebrate-milestone"
      >
        Celebrate
      </Button>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0" data-testid="button-dismiss-milestone">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function AnniversaryBanner({
  matchId,
  createdAt,
  onCelebrate,
  disabled,
}: {
  matchId: number;
  createdAt: string | Date;
  onCelebrate: (text: string) => void;
  disabled: boolean;
}) {
  const matched = new Date(createdAt);
  const now = new Date();
  const daysMatched = Math.floor((now.getTime() - matched.getTime()) / 86400000);

  let milestone: string | null = null;
  if (daysMatched === 7) {
    milestone = "1 week";
  } else if (daysMatched >= 28 && now.getDate() === matched.getDate()) {
    const months =
      (now.getFullYear() - matched.getFullYear()) * 12 +
      (now.getMonth() - matched.getMonth());
    if (months >= 1) {
      milestone = months === 12 ? "1 year" : `${months} month${months > 1 ? "s" : ""}`;
    }
  }

  const storageKey = `crush-anniv-${matchId}-${milestone}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  });

  if (!milestone || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="flex-none px-4 py-2.5 bg-gradient-to-r from-pink-500/10 to-amber-500/10 border-b border-border flex items-center gap-2.5" data-testid="banner-anniversary">
      <PartyPopper className="w-4 h-4 text-pink-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Match anniversary</p>
        <p className="text-xs font-medium truncate" data-testid="text-anniversary-milestone">
          It's been {milestone} since you two matched! 🎉
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0"
        disabled={disabled}
        onClick={() => {
          onCelebrate(`🎉 Happy ${milestone} matchiversary to us!`);
          dismiss();
        }}
        data-testid="button-celebrate-anniversary"
      >
        Celebrate
      </Button>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0" data-testid="button-dismiss-anniversary">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

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
  const [gamesOpen, setGamesOpen] = useState(false);
  const [ttalOpen, setTtalOpen] = useState(false);
  const [ttalStatements, setTtalStatements] = useState(["", "", ""]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiText, setEmojiText] = useState("");
  const [dateIdeasOpen, setDateIdeasOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ callerName: string; callerPhoto: string | null } | null>(null);
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

  const {
    data: dateIdeas,
    mutate: fetchDateIdeas,
    isPending: loadingIdeas,
    error: dateIdeasError,
    reset: resetDateIdeas,
  } = useMutation<{ ideas: { title: string; description: string }[] }>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/date-ideas", { matchId });
      return res.json();
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const notifyWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!matchId || matchId <= 0 || !profile) return;

    let ws: WebSocket | null = null;
    let cancelled = false;

    const connectNotifyWs = async () => {
      try {
        const tokenRes = await fetch('/api/video-call/notify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!tokenRes.ok || cancelled) return;
        const { token } = await tokenRes.json();
        if (cancelled) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/notifications`);
        notifyWsRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'incoming-call' && msg.matchId === matchId) {
              setIncomingCall({ callerName: msg.callerName, callerPhoto: msg.callerPhoto });
            }
          } catch {}
        };
      } catch {}
    };

    connectNotifyWs();

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/video-call/active/${matchId}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            setIncomingCall({ callerName: data.callerName, callerPhoto: data.callerPhoto });
          } else {
            setIncomingCall(null);
          }
        }
      } catch {}
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      if (ws) {
        ws.close();
        notifyWsRef.current = null;
      }
    };
  }, [matchId, profile]);

  const handleStartVideoCall = async () => {
    try {
      await apiRequest("POST", "/api/video-call/invite", { matchId });
      setLocation(`/video-call/${matchId}?initiator=true`);
    } catch {
      toast({ title: "Could not start video call", variant: "destructive" });
    }
  };

  const handleAcceptCall = () => {
    setIncomingCall(null);
    setLocation(`/video-call/${matchId}?accepted=true`);
  };

  const handleDeclineCall = async () => {
    setIncomingCall(null);
    if (notifyWsRef.current?.readyState === WebSocket.OPEN) {
      notifyWsRef.current.send(JSON.stringify({ type: 'decline-call', matchId }));
    }
    try {
      await apiRequest("POST", "/api/video-call/decline", { matchId });
    } catch {}
  };

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

  // Would You Rather: if the last message is a 🎲 question from my match,
  // offer the two options as one-tap replies.
  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  let wyrOptions: [string, string] | null = null;
  if (
    lastMsg &&
    lastMsg.senderId !== profile.userId &&
    !lastMsg.voiceNoteUrl &&
    lastMsg.content.startsWith(WYR_PREFIX)
  ) {
    const body = lastMsg.content.slice(WYR_PREFIX.length).replace(/\?\s*$/, "");
    const parts = body.split(" or ");
    if (parts.length === 2) {
      wyrOptions = [parts[0].trim(), parts[1].trim()];
    }
  }

  // Two Truths and a Lie: if the last message is a 🎭 game from my match,
  // offer one-tap guess chips.
  const showTtalGuess =
    !!lastMsg &&
    lastMsg.senderId !== profile.userId &&
    !lastMsg.voiceNoteUrl &&
    lastMsg.content.startsWith(TTAL_PREFIX);

  const sendQuickMessage = (text: string) => {
    if (sending || isTrialExpired) return;
    setError(null);
    sendMessage(text, {
      onError: (err: Error) => {
        if (err.message.includes("TRIAL_EXPIRED")) {
          setError("Your free trial has ended. Please subscribe to continue chatting.");
        } else {
          setError("Failed to send message");
        }
      },
    });
  };

  const sendWyrQuestion = () => {
    const [a, b] = WYR_PAIRS[Math.floor(Math.random() * WYR_PAIRS.length)];
    sendQuickMessage(`${WYR_PREFIX}${a} or ${b}?`);
  };

  const sendTtal = () => {
    const [a, b, c] = ttalStatements.map(s => s.trim());
    if (!a || !b || !c) return;
    sendQuickMessage(`${TTAL_PREFIX}\n1. ${a}\n2. ${b}\n3. ${c}\n\nWhich one is the lie? 🤔`);
    setTtalStatements(["", "", ""]);
    setTtalOpen(false);
  };

  const sendEmojiStory = () => {
    const story = emojiText.trim();
    if (!story) return;
    sendQuickMessage(`${EMOJI_STORY_PREFIX}${story}\n\nCan you guess what it means? 🍿`);
    setEmojiText("");
    setEmojiOpen(false);
  };

  // Kudos ("Great Vibes") — one per match partner; 3+ received earns the badge.
  const { data: kudosStatus } = useQuery<{ alreadyGiven: boolean; partnerKudos: number; partnerHasBadge: boolean }>({
    queryKey: ["/api/kudos/status", matchId],
    enabled: !!matchData,
  });
  const { mutate: sendKudos, isPending: sendingKudos } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/kudos", { matchId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kudos/status", matchId] });
    },
  });

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
          <h2 className="font-bold text-sm md:text-base leading-none mb-1 flex items-center gap-1.5 flex-wrap">
            {partnerProfile.displayName}
            {(partnerProfile as any).isVerified && (
              <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" data-testid="badge-verified-chat" />
            )}
            {kudosStatus?.partnerHasBadge && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full px-1.5 py-0.5" data-testid="badge-great-vibes">
                <Sparkles className="w-3 h-3" />
                Great Vibes
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Matched {matchData.match.createdAt ? formatDistanceToNow(new Date(matchData.match.createdAt), { addSuffix: true }) : 'recently'}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => sendKudos()}
          disabled={sendingKudos || kudosStatus?.alreadyGiven}
          title={kudosStatus?.alreadyGiven ? "You already sent Great Vibes 💖" : "Send Great Vibes"}
          data-testid="button-give-kudos"
        >
          <HeartHandshake className={`w-5 h-5 ${kudosStatus?.alreadyGiven ? "text-pink-500 fill-current" : ""}`} />
        </Button>

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

        {profile?.membershipTier === 'pro' || profile?.membershipTier === 'elite' ? (
          <Button variant="ghost" size="icon" onClick={handleStartVideoCall} data-testid="button-video-call">
            <Video className="w-5 h-5" />
          </Button>
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

      {incomingCall && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            data-testid="modal-incoming-call"
          >
            <div className="flex flex-col items-center gap-6">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <img
                  src={incomingCall.callerPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${incomingCall.callerName}`}
                  alt={incomingCall.callerName}
                  className="w-28 h-28 rounded-full object-cover border-4 border-green-500/40"
                  data-testid="img-incoming-caller"
                />
              </motion.div>
              <div className="text-center">
                <h3 className="text-white text-xl font-semibold" data-testid="text-incoming-caller-name">{incomingCall.callerName}</h3>
                <p className="text-white/60 text-sm mt-1">Incoming Video Call...</p>
              </div>
              <div className="flex items-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="w-16 h-16 rounded-full"
                    onClick={handleDeclineCall}
                    data-testid="button-decline-call"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </Button>
                  <span className="text-white/60 text-xs">Decline</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Button
                    size="icon"
                    className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white"
                    onClick={handleAcceptCall}
                    data-testid="button-accept-call"
                  >
                    <Phone className="w-7 h-7" />
                  </Button>
                  <span className="text-white/60 text-xs">Accept</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

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

      {!isTrialExpired && (
        <IcebreakerBanner
          key={`icebreaker-${matchId}-${new Date().toISOString().slice(0, 10)}`}
          matchId={matchId}
          onAsk={sendQuickMessage}
          disabled={sending}
        />
      )}

      {!isTrialExpired && matchData.match.createdAt && (
        <AnniversaryBanner
          matchId={matchId}
          createdAt={matchData.match.createdAt}
          onCelebrate={sendQuickMessage}
          disabled={sending}
        />
      )}

      {!isTrialExpired && (
        <MilestoneBanner
          matchId={matchId}
          messageCount={messages?.length || 0}
          onCelebrate={sendQuickMessage}
          disabled={sending}
        />
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
        {showTtalGuess && !isTrialExpired && (
          <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="chips-ttal-guess">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Drama className="w-3.5 h-3.5" />
              Which is the lie?
            </span>
            {[1, 2, 3].map((n) => (
              <Button
                key={n}
                size="sm"
                variant="outline"
                className="h-7 text-xs rounded-full"
                disabled={sending}
                onClick={() => sendQuickMessage(`🎭 My guess: #${n} is the lie!`)}
                data-testid={`button-ttal-guess-${n}`}
              >
                #{n}
              </Button>
            ))}
          </div>
        )}
        {wyrOptions && !isTrialExpired && (
          <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="chips-wyr-options">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Dices className="w-3.5 h-3.5" />
              Your pick:
            </span>
            {wyrOptions.map((option, i) => (
              <Button
                key={i}
                size="sm"
                variant="outline"
                className="h-7 text-xs rounded-full"
                disabled={sending}
                onClick={() => sendQuickMessage(`🎲 I'd rather ${option}!`)}
                data-testid={`button-wyr-option-${i}`}
              >
                {option}
              </Button>
            ))}
          </div>
        )}
        {error && (
           <div className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex flex-col items-center gap-2 text-center animate-in slide-in-from-bottom-2">
             <p>{error}</p>
             {error.includes("subscribe") && (
               <Link href="/premium" className="w-full">
                 <Button size="sm" variant="destructive" className="w-full">
                   Upgrade to Premium
                 </Button>
               </Link>
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
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setGamesOpen(true)}
                  disabled={sending}
                  title="Play a chat game"
                  data-testid="button-open-games"
                >
                  <Gamepad2 className="w-5 h-5" />
                </Button>
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
              </>
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

      {gamesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setGamesOpen(false)} data-testid="modal-games">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full mx-4 space-y-3 shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-primary" />
                Chat Games
              </h3>
              <button onClick={() => setGamesOpen(false)} className="text-muted-foreground hover:text-foreground" data-testid="button-close-games">
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate text-left"
              onClick={() => { setGamesOpen(false); setTtalOpen(true); }}
              data-testid="button-game-ttal"
            >
              <Drama className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Two Truths and a Lie 🎭</p>
                <p className="text-xs text-muted-foreground">Share 3 things — they guess the lie!</p>
              </div>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate text-left"
              onClick={() => { setGamesOpen(false); setEmojiOpen(true); }}
              data-testid="button-game-emoji"
            >
              <Clapperboard className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Emoji Story 🎬</p>
                <p className="text-xs text-muted-foreground">Tell a story in emojis — they decode it!</p>
              </div>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate text-left"
              onClick={() => { setGamesOpen(false); sendWyrQuestion(); }}
              data-testid="button-game-wyr"
            >
              <Dices className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Would You Rather 🎲</p>
                <p className="text-xs text-muted-foreground">Send a random this-or-that question</p>
              </div>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate text-left"
              onClick={() => {
                setGamesOpen(false);
                setDateIdeasOpen(true);
                if (!dateIdeas) fetchDateIdeas();
              }}
              data-testid="button-game-date-ideas"
            >
              <CalendarHeart className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">AI Date Ideas 💡</p>
                <p className="text-xs text-muted-foreground">Get 3 date ideas based on your interests</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {ttalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setTtalOpen(false)} data-testid="modal-ttal">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full mx-4 space-y-3 shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Drama className="w-5 h-5 text-primary" />
                Two Truths and a Lie
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Write two true things and one lie (in any order). {partnerProfile.displayName} will guess which is the lie!</p>
            </div>
            {ttalStatements.map((s, i) => (
              <Input
                key={i}
                value={s}
                onChange={(e) => setTtalStatements(prev => prev.map((p, j) => (j === i ? e.target.value : p)))}
                placeholder={`Statement ${i + 1}`}
                maxLength={120}
                data-testid={`input-ttal-${i + 1}`}
              />
            ))}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setTtalOpen(false)} data-testid="button-cancel-ttal">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={sendTtal}
                disabled={sending || ttalStatements.some(s => !s.trim())}
                data-testid="button-send-ttal"
              >
                Send it 🎭
              </Button>
            </div>
          </div>
        </div>
      )}

      {emojiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setEmojiOpen(false)} data-testid="modal-emoji-story">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full mx-4 space-y-3 shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Clapperboard className="w-5 h-5 text-primary" />
                Emoji Story
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Describe a movie, your day, or a dream date using only emojis. {partnerProfile.displayName} has to guess it!</p>
            </div>
            <Input
              value={emojiText}
              onChange={(e) => setEmojiText(e.target.value)}
              placeholder="e.g. 🍕🎬🌙✨"
              maxLength={80}
              data-testid="input-emoji-story"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEmojiOpen(false)} data-testid="button-cancel-emoji">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={sendEmojiStory}
                disabled={sending || !emojiText.trim()}
                data-testid="button-send-emoji-story"
              >
                Send it 🎬
              </Button>
            </div>
          </div>
        </div>
      )}

      {dateIdeasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setDateIdeasOpen(false)} data-testid="modal-date-ideas">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full mx-4 space-y-3 shadow-xl border border-border max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <CalendarHeart className="w-5 h-5 text-primary" />
                Date Ideas for You Two
              </h3>
              <button onClick={() => setDateIdeasOpen(false)} className="text-muted-foreground hover:text-foreground" data-testid="button-close-date-ideas">
                <X className="w-4 h-4" />
              </button>
            </div>
            {loadingIdeas ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Dreaming up date ideas...</span>
              </div>
            ) : dateIdeasError ? (
              <div className="space-y-2 text-center py-2">
                <p className="text-sm text-muted-foreground">{(dateIdeasError as Error).message.replace(/^\d+:\s*/, "") || "Couldn't get ideas right now."}</p>
                <Button size="sm" variant="outline" onClick={() => fetchDateIdeas()} data-testid="button-retry-date-ideas">
                  Try again
                </Button>
              </div>
            ) : dateIdeas?.ideas?.length ? (
              <div className="space-y-2">
                {dateIdeas.ideas.map((idea, i) => (
                  <div key={i} className="p-3 rounded-lg border border-border space-y-1.5" data-testid={`card-date-idea-${i}`}>
                    <p className="text-sm font-semibold">{idea.title}</p>
                    <p className="text-xs text-muted-foreground">{idea.description}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={sending}
                      onClick={() => {
                        sendQuickMessage(`💡 Date idea: ${idea.title} — ${idea.description}`);
                        setDateIdeasOpen(false);
                        toast({ title: "Date idea sent! 💌" });
                      }}
                      data-testid={`button-suggest-idea-${i}`}
                    >
                      Suggest this
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="w-full text-xs" disabled={loadingIdeas} onClick={() => { resetDateIdeas(); fetchDateIdeas(); }} data-testid="button-more-ideas">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  More ideas
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        reportedUserId={partnerProfile.userId}
        reportedUserName={partnerProfile.displayName}
      />
    </div>
  );
}
