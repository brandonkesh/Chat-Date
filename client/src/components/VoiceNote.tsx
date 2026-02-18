import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Trash2, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const MAX_DURATION = 60;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface VoiceNoteRecorderProps {
  onSend: (voiceNoteUrl: string, duration: number) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ onSend, onCancel, disabled }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    startRecording();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast({ title: "Microphone access denied", description: "Please allow microphone access to record voice notes.", variant: "destructive" });
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const playPreview = () => {
    if (!recordedUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(recordedUrl);
    audioRef.current = audio;
    setIsPlaying(true);
    audio.onended = () => setIsPlaying(false);
    audio.play();
  };

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleDiscard = () => {
    cleanup();
    onCancel();
  };

  const handleSend = async () => {
    if (!recordedBlob) return;
    setIsUploading(true);
    try {
      const res = await apiRequest("POST", "/api/uploads/voice-note");
      const { uploadURL, objectPath } = await res.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: recordedBlob,
        headers: { "Content-Type": "audio/webm" },
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      onSend(objectPath, recordingTime);
    } catch {
      toast({ title: "Upload failed", description: "Could not send voice note. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 w-full" data-testid="voice-note-recorder">
      {isRecording ? (
        <>
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-full bg-destructive/10 border border-destructive/20">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium text-destructive" data-testid="text-recording-time">
              {formatTime(recordingTime)}
            </span>
            <div className="flex-1 flex items-center gap-0.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-destructive/60 rounded-full"
                  style={{ height: `${Math.random() * 16 + 4}px`, transition: "height 0.1s" }}
                />
              ))}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDiscard}
            data-testid="button-cancel-recording"
          >
            <Trash2 className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Button
            size="icon"
            onClick={stopRecording}
            data-testid="button-stop-recording"
          >
            <Square className="w-4 h-4" />
          </Button>
        </>
      ) : recordedBlob ? (
        <>
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-full bg-secondary border border-border">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={isPlaying ? stopPreview : playPreview}
              data-testid="button-preview-voice-note"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <span className="text-sm font-medium text-muted-foreground" data-testid="text-recorded-duration">
              {formatTime(recordingTime)}
            </span>
            <div className="flex-1 flex items-center gap-0.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-muted-foreground/40 rounded-full"
                  style={{ height: `${Math.random() * 12 + 4}px` }}
                />
              ))}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDiscard}
            disabled={isUploading}
            data-testid="button-discard-voice-note"
          >
            <Trash2 className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isUploading || disabled}
            data-testid="button-send-voice-note"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </>
      ) : null}
    </div>
  );
}

interface VoiceNotePlayerProps {
  url: string;
  duration?: number | null;
  isMe?: boolean;
}

export function VoiceNotePlayer({ url, duration, isMe }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
      return;
    }

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };

    audio.play().then(() => {
      setIsPlaying(true);
      progressInterval.current = setInterval(() => {
        if (audio.currentTime !== undefined) {
          setCurrentTime(audio.currentTime);
        }
      }, 100);
    }).catch(() => {
      setIsPlaying(false);
    });
  }, [isPlaying, url]);

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[160px]" data-testid="voice-note-player">
      <button
        onClick={togglePlay}
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          isMe
            ? "bg-primary-foreground/20 hover:bg-primary-foreground/30"
            : "bg-primary/10 hover:bg-primary/20"
        }`}
        data-testid="button-play-voice-note"
      >
        {isPlaying ? (
          <Pause className={`w-4 h-4 ${isMe ? "text-primary-foreground" : "text-primary"}`} />
        ) : (
          <Play className={`w-4 h-4 ${isMe ? "text-primary-foreground" : "text-primary"}`} />
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`h-1 rounded-full overflow-hidden ${isMe ? "bg-primary-foreground/20" : "bg-primary/10"}`}>
          <div
            className={`h-full rounded-full transition-all ${isMe ? "bg-primary-foreground" : "bg-primary"}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <span className={`text-[10px] ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`} data-testid="text-voice-note-duration">
          {isPlaying ? formatTime(currentTime) : formatTime(totalDuration || duration || 0)}
        </span>
      </div>
      <Mic className={`w-3 h-3 flex-shrink-0 ${isMe ? "text-primary-foreground/50" : "text-muted-foreground/50"}`} />
    </div>
  );
}
