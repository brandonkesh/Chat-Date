import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Dices, Send, Heart, DoorOpen, Timer } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type BlindDateState = {
  id: number;
  status: "waiting" | "active" | "revealed" | "ended";
  startedAt: string | null;
  endsAt: string | null;
  partner:
    | null
    | { firstName: string }
    | {
        displayName: string;
        age: number;
        bio: string | null;
        photoUrl: string | null;
      };
} | null;

type BlindMessage = { id: number; fromMe: boolean; content: string; createdAt: string };

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return (
    <span className="font-mono font-semibold tabular-nums" data-testid="text-countdown">
      {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}

export default function BlindRoulette() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: session, isLoading } = useQuery<BlindDateState>({
    queryKey: ["/api/blind-roulette/current"],
    refetchInterval: (query) => {
      const s = query.state.data;
      if (s && (s.status === "waiting" || s.status === "active")) return 3000;
      return false;
    },
  });

  const isParticipating = !!session && (session.status === "waiting" || session.status === "active" || session.status === "revealed");

  const { data: messages } = useQuery<BlindMessage[]>({
    queryKey: ["/api/blind-roulette", session?.id, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/blind-roulette/${session!.id}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!session && (session.status === "active" || session.status === "revealed"),
    refetchInterval: session?.status === "active" ? 2500 : false,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const { mutate: join, isPending: joining } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/blind-roulette/join");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/blind-roulette/current"], data);
    },
    onError: () => {
      toast({ title: "Couldn't join", description: "Please try again in a moment.", variant: "destructive" });
    },
  });

  const { mutate: leave, isPending: leaving } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/blind-roulette/leave");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/blind-roulette/current"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/blind-roulette/current"] });
    },
  });

  const { mutate: sendMsg, isPending: sending } = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/blind-roulette/${session!.id}/messages`, { content });
      return res.json();
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["/api/blind-roulette", session?.id, "messages"] });
    },
    onError: (err: Error) => {
      if (err.message.includes("ended")) {
        queryClient.invalidateQueries({ queryKey: ["/api/blind-roulette/current"] });
      }
    },
  });

  const { mutate: like, isPending: liking } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/blind-roulette/${session!.id}/like`);
      return res.json();
    },
    onSuccess: (data: { match: boolean; matchId?: number }) => {
      if (data.match && data.matchId) {
        toast({
          title: "It's a Match! 💘",
          description: "You both liked each other — taking you to your new chat!",
          className: "bg-gradient-to-r from-primary to-accent text-white border-none",
        });
        leave();
        setLocation(`/chat/${data.matchId}`);
      } else {
        toast({ title: "Like sent! 💌", description: "If they like you back, you'll match for real." });
      }
    },
  });

  const handleSend = () => {
    const content = text.trim();
    if (!content || sending) return;
    sendMsg(content);
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  // === Not in a session: intro screen ===
  if (!isParticipating) {
    return (
      <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-blind-roulette">
        <div className="flex items-center gap-3">
          <Link href="/feed">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold" data-testid="heading-blind-roulette">Blind Date Roulette</h1>
            <p className="text-sm text-muted-foreground">Chat first, see faces later 🎭</p>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-accent p-8 text-center text-white">
            <Dices className="w-16 h-16 mx-auto mb-4" />
            <h2 className="font-display text-xl font-bold mb-2">Feeling lucky?</h2>
            <p className="text-sm text-white/85 max-w-xs mx-auto">
              We'll pair you with a mystery member for a 5-minute anonymous chat.
              No photos, no profiles — just conversation. When the timer ends, you're both revealed! 🎉
            </p>
          </div>
          <CardContent className="p-6 space-y-3">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>🎲 Random pairing — anyone could be behind the curtain</p>
              <p>⏱️ 5 minutes of anonymous chatting</p>
              <p>🎭 Big reveal at the end — like them? Send a like!</p>
              <p>💘 If you both like each other, it becomes a real match</p>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => join()}
              disabled={joining}
              data-testid="button-join-roulette"
            >
              {joining ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Dices className="w-4 h-4 mr-2" />}
              Spin the roulette
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Waiting for a partner ===
  if (session!.status === "waiting") {
    return (
      <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20" data-testid="page-blind-roulette">
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <div className="relative w-20 h-20 mx-auto">
              <Dices className="w-20 h-20 text-primary animate-bounce" />
            </div>
            <h2 className="font-display text-xl font-bold">Finding your mystery date...</h2>
            <p className="text-sm text-muted-foreground">
              You're in the pool! The moment someone else spins, you'll be paired instantly. Keep this page open. ✨
            </p>
            <Button variant="outline" onClick={() => leave()} disabled={leaving} data-testid="button-leave-roulette">
              <DoorOpen className="w-4 h-4 mr-2" />
              Leave the pool
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const revealed = session!.status === "revealed";
  const partnerFull = revealed && session!.partner && "displayName" in (session!.partner as any)
    ? (session!.partner as { displayName: string; age: number; bio: string | null; photoUrl: string | null })
    : null;
  const partnerFirstName = !revealed && session!.partner && "firstName" in (session!.partner as any)
    ? (session!.partner as { firstName: string }).firstName
    : null;

  return (
    <div className="flex flex-col h-screen bg-background max-w-3xl mx-auto border-x border-border" data-testid="page-blind-roulette">
      <header className="flex-none p-4 border-b border-border bg-card/80 backdrop-blur-md flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => leave()} data-testid="button-exit-roulette">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-lg shrink-0">
          {revealed && partnerFull ? (
            <img
              src={partnerFull.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerFull.displayName}`}
              alt={partnerFull.displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            "🎭"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm truncate" data-testid="text-partner-name">
            {revealed && partnerFull ? `${partnerFull.displayName}, ${partnerFull.age}` : `Mystery date${partnerFirstName ? ` (${partnerFirstName})` : ""}`}
          </h2>
          <p className="text-xs text-muted-foreground">
            {revealed ? "Revealed! 🎉" : "Anonymous chat"}
          </p>
        </div>
        {!revealed && session!.endsAt && (
          <div className="flex items-center gap-1.5 text-sm bg-secondary rounded-full px-3 py-1">
            <Timer className="w-4 h-4 text-primary" />
            <Countdown endsAt={session!.endsAt} />
          </div>
        )}
      </header>

      {revealed && (
        <div className="flex-none p-4 bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border text-center space-y-3" data-testid="banner-reveal">
          <p className="text-sm font-medium">
            🎭 The curtain drops! {partnerFull ? `Meet ${partnerFull.displayName}` : "Your date left before the reveal."}
          </p>
          {partnerFull?.bio && (
            <p className="text-xs text-muted-foreground max-w-sm mx-auto line-clamp-2">"{partnerFull.bio}"</p>
          )}
          {partnerFull && (
            <div className="flex justify-center gap-2">
              <Button onClick={() => like()} disabled={liking} data-testid="button-like-blind-date">
                {liking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-4 h-4 mr-2" />}
                I like them!
              </Button>
              <Button variant="outline" onClick={() => leave()} disabled={leaving} data-testid="button-pass-blind-date">
                Maybe next spin
              </Button>
            </div>
          )}
          {!partnerFull && (
            <Button variant="outline" onClick={() => leave()} disabled={leaving} data-testid="button-done-blind-date">
              Back to roulette
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/5">
        {(messages || []).length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">
            Say hi! You have 5 minutes of mystery. 🕵️
          </p>
        )}
        {(messages || []).map((m) => (
          <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                m.fromMe
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border border-border rounded-bl-sm"
              }`}
              data-testid={`message-blind-${m.id}`}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {session!.status === "active" && (
        <div className="flex-none p-3 border-t border-border bg-card flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            maxLength={500}
            data-testid="input-blind-message"
          />
          <Button onClick={handleSend} disabled={sending || !text.trim()} size="icon" data-testid="button-send-blind-message">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
