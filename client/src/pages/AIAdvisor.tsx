import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mic, MicOff, Send, Volume2, VolumeX, Sparkles, Loader2, Bot, User, Lightbulb } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  audioUrl?: string;
}

const SUGGESTED_TOPICS = [
  "What are some creative first date ideas?",
  "How do I write a great opening message?",
  "Tips for making my profile stand out",
  "How to keep a conversation going",
  "What are some red flags to watch for?",
  "How to handle rejection gracefully",
];

export default function AIAdvisor() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, [audioEnabled, stopCurrentAudio]);

  const sendMessage = useCallback(async (content: string, audioBase64?: string) => {
    if (isProcessing) return;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };

    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setIsProcessing(true);

    try {
      const conversationHistory = currentMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const body: Record<string, any> = {
        history: conversationHistory,
        generateAudio: audioEnabled,
      };

      if (audioBase64) {
        body.audio = audioBase64;
      } else {
        body.text = content;
      }

      const res = await apiRequest("POST", "/api/ai-advisor/chat", body);
      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.text,
        audioUrl: data.audio,
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (data.audio && audioEnabled) {
        playAudio(data.audio);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, messages, audioEnabled, playAudio, toast]);

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
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          sendMessage("[Voice message]", base64);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice chat.",
        variant: "destructive",
      });
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
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/feed")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold" data-testid="text-page-title">AI Dating Advisor</h1>
              <p className="text-xs text-muted-foreground">
                {isProcessing ? "Thinking..." : isSpeaking ? "Speaking..." : "Ask me anything about dating"}
              </p>
            </div>
          </div>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                stopCurrentAudio();
                setAudioEnabled(!audioEnabled);
              }}
              data-testid="button-toggle-audio"
            >
              {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        <Card className="border-border/50 overflow-hidden">
          <div
            ref={scrollRef}
            className="h-[calc(100vh-320px)] md:h-[calc(100vh-280px)] overflow-y-auto p-4 space-y-4"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-2" data-testid="text-welcome">Hi! I'm your AI Dating Advisor</h2>
                  <p className="text-muted-foreground text-sm max-w-md">
                    Ask me anything about dating — first date ideas, conversation tips,
                    profile advice, or how to handle tricky situations. You can type or use voice!
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {SUGGESTED_TOPICS.map((topic, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      onClick={() => sendMessage(topic)}
                      className="text-left text-sm p-3 h-auto rounded-xl justify-start items-start gap-2"
                      data-testid={`button-suggestion-${i}`}
                    >
                      <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <span className="whitespace-normal">{topic}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <Avatar className={`w-8 h-8 shrink-0 ${msg.role === "assistant" ? "bg-gradient-to-br from-purple-500 to-pink-500" : "bg-primary"}`}>
                    <AvatarFallback className="bg-transparent text-white">
                      {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    }`}
                    data-testid={`message-${msg.role}-${msg.id}`}
                  >
                    {msg.content === "[Voice message]" ? (
                      <span className="italic flex items-center gap-1">
                        <Mic className="w-3 h-3" /> Voice message
                      </span>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <Avatar className="w-8 h-8 shrink-0 bg-gradient-to-br from-purple-500 to-pink-500">
                  <AvatarFallback className="bg-transparent text-white">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
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
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                size="icon"
                className={`shrink-0 rounded-full ${isRecording ? "animate-pulse" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                data-testid="button-record"
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Input
                ref={inputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={isRecording ? "Recording..." : "Type your question..."}
                disabled={isProcessing || isRecording}
                className="rounded-full"
                data-testid="input-message"
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0 rounded-full"
                disabled={isProcessing || isRecording || !textInput.trim()}
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
