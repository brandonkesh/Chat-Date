import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, Mic, MicOff, Send, Volume2, VolumeX, Sparkles, Loader2, Bot, User,
  Lightbulb, ChevronDown, Globe, AudioLines, ChevronRight, RefreshCw, AlertCircle,
  Camera, FileText, Heart, Dumbbell, ClipboardList, ShieldCheck, TrendingUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

/* ─── Shared types ─── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  audioUrl?: string;
}

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

/* ─── Constants ─── */
const VOICES = [
  { id: "nova", label: "Nova", gender: "Female", lang: "English" },
  { id: "shimmer", label: "Shimmer", gender: "Female", lang: "English" },
  { id: "alloy", label: "Alloy", gender: "Neutral", lang: "English" },
  { id: "echo", label: "Echo", gender: "Male", lang: "English" },
  { id: "onyx", label: "Onyx", gender: "Male", lang: "English" },
  { id: "fable", label: "Fable", gender: "Male", lang: "English (British)" },
];

const LANGUAGES = [
  { id: "english", label: "English" },
  { id: "spanish", label: "Spanish" },
  { id: "french", label: "French" },
  { id: "german", label: "German" },
  { id: "italian", label: "Italian" },
  { id: "portuguese", label: "Portuguese" },
  { id: "japanese", label: "Japanese" },
  { id: "korean", label: "Korean" },
  { id: "chinese", label: "Chinese (Mandarin)" },
  { id: "arabic", label: "Arabic" },
  { id: "hindi", label: "Hindi" },
  { id: "russian", label: "Russian" },
];

const SUGGESTED_TOPICS = [
  "What are some creative first date ideas?",
  "How do I write a great opening message?",
  "Tips for making my profile stand out",
  "How to keep a conversation going",
  "What are some red flags to watch for?",
  "How to handle rejection gracefully",
];

const iconMap: Record<string, typeof Camera> = {
  photo: Camera,
  bio: FileText,
  interests: Heart,
  lifestyle: Dumbbell,
  details: ClipboardList,
  verification: ShieldCheck,
};

/* ─── Profile Optimizer sub-components ─── */
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
      <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%`, transition: "width 0.8s ease-out" }} />
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

/* ─── Profile Optimizer tab content ─── */
function ProfileOptimizerTab() {
  const { data: feedback, isLoading, isError, refetch, isFetching } = useQuery<ProfileFeedback>({
    queryKey: ["/api/profiles/ai-feedback"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/profiles/ai-feedback"] });
    refetch();
  };

  if (isLoading || isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Sparkles className="w-12 h-12 text-foreground animate-pulse" />
        <div className="text-center space-y-1">
          <p className="font-medium">Analyzing your profile...</p>
          <p className="text-sm text-muted-foreground">AI is reviewing your profile to give personalized tips</p>
        </div>
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="mt-4">
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
    );
  }

  if (!feedback) return null;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isFetching} data-testid="button-refresh-feedback">
          <RefreshCw className={`w-5 h-5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

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
    </div>
  );
}

/* ─── Main page ─── */
export default function AIAdvisor() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState("nova");
  const [selectedLanguage, setSelectedLanguage] = useState("english");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentVoice = VOICES.find(v => v.id === selectedVoice);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const stopCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      const src = audioRef.current.src;
      audioRef.current = null;
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    }
    setIsSpeaking(false);
  }, []);

  const playAudio = useCallback(async (base64Audio: string) => {
    stopCurrentAudio();
    if (!audioEnabled) return;
    try {
      const audioBlob = new Blob(
        [Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))],
        { type: "audio/mp3" }
      );
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsSpeaking(true);
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, [audioEnabled, stopCurrentAudio]);

  const sendMessage = useCallback(async (content: string, audioBase64?: string) => {
    if (isProcessing) return;
    const userMessage: Message = { id: Date.now().toString(), role: "user", content };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setIsProcessing(true);
    try {
      const conversationHistory = currentMessages.map(m => ({ role: m.role, content: m.content }));
      const body: Record<string, any> = {
        history: conversationHistory,
        generateAudio: audioEnabled,
        voice: selectedVoice,
        language: selectedLanguage,
      };
      if (audioBase64) body.audio = audioBase64;
      else body.text = content;

      const res = await apiRequest("POST", "/api/ai-advisor/chat", body);
      const data = await res.json();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.text,
        audioUrl: data.audio,
      };
      setMessages(prev => [...prev, assistantMessage]);
      if (data.audio && audioEnabled) playAudio(data.audio);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, messages, audioEnabled, selectedVoice, selectedLanguage, playAudio, toast]);

  const handleTextSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    sendMessage(text);
  }, [textInput, sendMessage]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm",
      });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => { const base64 = (reader.result as string).split(",")[1]; sendMessage("[Voice message]", base64); };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone access denied", description: "Please allow microphone access to use voice chat.", variant: "destructive" });
    }
  }, [sendMessage, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-4 md:pt-20">
      <div className="max-w-2xl mx-auto px-4 pt-4">

        {/* Page header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/feed")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold" data-testid="text-page-title">AI Tools</h1>
              <p className="text-xs text-muted-foreground">Your personal dating assistant</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="advisor" className="w-full">
          <TabsList className="w-full mb-4" data-testid="tabs-ai-tools">
            <TabsTrigger value="advisor" className="flex-1" data-testid="tab-advisor">
              <Bot className="w-4 h-4 mr-1.5" />
              Dating Advisor
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex-1" data-testid="tab-profile">
              <TrendingUp className="w-4 h-4 mr-1.5" />
              Profile Optimizer
            </TabsTrigger>
          </TabsList>

          {/* ── Advisor tab ── */}
          <TabsContent value="advisor">
            {/* Voice / language settings bar */}
            <div className="flex items-center justify-end gap-1 mb-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="button-settings-dropdown">
                    <AudioLines className="w-3.5 h-3.5" />
                    {currentVoice?.label}
                    <span className="text-muted-foreground">·</span>
                    <Globe className="w-3.5 h-3.5" />
                    {LANGUAGES.find(l => l.id === selectedLanguage)?.label}
                    <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4" />Voice
                  </DropdownMenuLabel>
                  {VOICES.map(v => (
                    <DropdownMenuItem key={v.id} onClick={() => setSelectedVoice(v.id)} className={selectedVoice === v.id ? "bg-accent" : ""} data-testid={`option-voice-${v.id}`}>
                      <span className="flex-1">{v.label}</span>
                      <span className="text-xs text-muted-foreground">{v.gender} · {v.lang}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger data-testid="submenu-language">
                      <Globe className="w-4 h-4 mr-2" />
                      Language: {LANGUAGES.find(l => l.id === selectedLanguage)?.label}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                      {LANGUAGES.map(l => (
                        <DropdownMenuItem key={l.id} onClick={() => setSelectedLanguage(l.id)} className={selectedLanguage === l.id ? "bg-accent" : ""} data-testid={`option-lang-${l.id}`}>
                          {l.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon" onClick={() => { stopCurrentAudio(); setAudioEnabled(!audioEnabled); }} data-testid="button-toggle-audio">
                {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </Button>
            </div>

            {/* Status line */}
            <p className="text-xs text-muted-foreground text-right mb-2">
              {isProcessing ? "Thinking..." : isSpeaking ? "Speaking..." : `${currentVoice?.label} · ${LANGUAGES.find(l => l.id === selectedLanguage)?.label}`}
            </p>

            <Card className="border-border/50 overflow-hidden">
              <div ref={scrollRef} className="h-[calc(100vh-340px)] md:h-[calc(100vh-300px)] overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Sparkles className="w-10 h-10 text-purple-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold mb-2" data-testid="text-welcome">Hi! I'm your AI Dating Advisor</h2>
                      <p className="text-muted-foreground text-sm max-w-md">
                        Ask me anything about dating — first date ideas, conversation tips, profile advice, or how to handle tricky situations. You can type or use voice!
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                      {SUGGESTED_TOPICS.map((topic, i) => (
                        <Button key={i} variant="outline" onClick={() => sendMessage(topic)}
                          className="text-left text-sm p-3 h-auto rounded-xl justify-start items-start gap-2"
                          data-testid={`button-suggestion-${i}`}>
                          <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <span className="whitespace-normal">{topic}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {messages.map((msg) => (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                      className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <Avatar className={`w-8 h-8 shrink-0 ${msg.role === "assistant" ? "bg-gradient-to-br from-purple-500 to-pink-500" : "bg-primary"}`}>
                        <AvatarFallback className="bg-transparent text-white">
                          {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"
                      }`} data-testid={`message-${msg.role}-${msg.id}`}>
                        {msg.content === "[Voice message]" ? (
                          <span className="italic flex items-center gap-1"><Mic className="w-3 h-3" /> Voice message</span>
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isProcessing && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                    <Avatar className="w-8 h-8 shrink-0 bg-gradient-to-br from-purple-500 to-pink-500">
                      <AvatarFallback className="bg-transparent text-white"><Bot className="w-4 h-4" /></AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="border-t border-border/50 p-3">
                <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
                  <Button type="button" variant={isRecording ? "destructive" : "outline"} size="icon"
                    className={`shrink-0 rounded-full ${isRecording ? "animate-pulse" : ""}`}
                    onClick={isRecording ? stopRecording : startRecording} disabled={isProcessing}
                    data-testid="button-record">
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <Input ref={inputRef} value={textInput} onChange={(e) => setTextInput(e.target.value)}
                    placeholder={isRecording ? "Recording..." : "Type your question..."}
                    disabled={isProcessing || isRecording} className="rounded-full" data-testid="input-message" />
                  <Button type="submit" size="icon" className="shrink-0 rounded-full"
                    disabled={isProcessing || isRecording || !textInput.trim()} data-testid="button-send">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </Card>
          </TabsContent>

          {/* ── Profile Optimizer tab ── */}
          <TabsContent value="profile">
            <ProfileOptimizerTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
