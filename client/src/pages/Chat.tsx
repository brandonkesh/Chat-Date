import { useRoute, useLocation } from "wouter";
import { useMatch, useMessages, useSendMessage, useMyProfile } from "@/hooks/use-dating";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, ChevronLeft, Clock, Lock, Video, Flag, Zap, Crown } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { Link } from "wouter";
import { ReportDialog } from "@/components/ReportDialog";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, isPast } from "date-fns";
import { motion } from "framer-motion";

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
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!matchData) return <div>Match not found</div>;

  const { partnerProfile } = matchData;
  const isTrialExpired = profile.trialEndsAt ? isPast(new Date(profile.trialEndsAt)) : false;

  return (
    <div className="flex flex-col h-screen bg-background max-w-3xl mx-auto border-x border-border shadow-2xl">
      {/* Header */}
      <header className="flex-none p-4 border-b border-border bg-white/80 dark:bg-black/80 backdrop-blur-md flex items-center gap-3 sticky top-0 z-10">
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
              <Zap className="w-5 h-5 text-primary" />
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
          onClick={() => setReportOpen(true)}
          data-testid="button-report-user"
        >
          <Flag className="w-5 h-5" />
        </Button>
      </header>

      {/* Trial Banner */}
      {!isTrialExpired ? (
        <div className="bg-primary/5 p-2 text-center text-xs font-medium text-primary border-b border-primary/10 flex items-center justify-center gap-2">
          <Clock className="w-3 h-3" />
          Trial active until {new Date(profile.trialEndsAt).toLocaleDateString()}
        </div>
      ) : (
        <div className="bg-destructive/10 p-2 text-center text-xs font-medium text-destructive border-b border-destructive/10 flex items-center justify-center gap-2">
          <Lock className="w-3 h-3" />
          Trial Expired
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-secondary/5">
        {loadingMessages ? (
          <div className="flex justify-center p-4">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
              <Send className="w-8 h-8 text-primary/50" />
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
                      : "bg-white dark:bg-zinc-800 text-foreground rounded-tl-none border border-border"
                    }
                  `}
                >
                  {msg.content}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
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

        <form onSubmit={handleSend} className="flex gap-2">
          <Input 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isTrialExpired ? "Subscription required to chat..." : "Type a message..."}
            className="flex-1"
            disabled={sending || isTrialExpired}
            data-testid="input-message"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!inputValue.trim() || sending || isTrialExpired}
            data-testid="button-send"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </form>
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
