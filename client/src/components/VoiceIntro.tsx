import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Square, Play, Pause, Trash2, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface VoiceIntroProps {
  voiceIntroUrl?: string | null;
  editable?: boolean;
}

export function VoiceIntro({ voiceIntroUrl, editable = false }: VoiceIntroProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const MAX_DURATION = 30;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast({
        title: "Microphone Access",
        description: "Please allow microphone access to record your voice intro.",
        variant: "destructive",
      });
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

  const playAudio = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    setIsPlaying(true);
    setPlaybackTime(0);

    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
    };

    audio.ontimeupdate = () => {
      setPlaybackTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setPlaybackTime(0);
    };

    audio.play();
  };

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const discardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingTime(0);
    setPlaybackTime(0);
  };

  const uploadVoiceIntro = async () => {
    if (!recordedBlob) return;
    setIsUploading(true);
    try {
      const res = await apiRequest("POST", "/api/uploads/voice-intro");
      const { uploadURL, objectPath } = await res.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: recordedBlob,
        headers: { "Content-Type": "audio/webm" },
      });

      if (!uploadRes.ok) {
        throw new Error("Upload failed");
      }

      await apiRequest("PUT", "/api/profiles/voice-intro", {
        voiceIntroUrl: objectPath,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      discardRecording();
      toast({
        title: "Voice Intro Saved",
        description: "Your voice intro has been uploaded successfully.",
      });
    } catch {
      toast({
        title: "Upload Failed",
        description: "Could not upload your voice intro. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteVoiceIntro = async () => {
    setIsUploading(true);
    try {
      await apiRequest("PUT", "/api/profiles/voice-intro", {
        voiceIntroUrl: null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({
        title: "Voice Intro Removed",
        description: "Your voice intro has been deleted.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Could not remove voice intro.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const currentAudioUrl = recordedUrl || voiceIntroUrl;
  const hasExistingIntro = !!voiceIntroUrl && !recordedUrl;

  if (!editable && !voiceIntroUrl) return null;

  return (
    <Card data-testid="card-voice-intro">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">Voice Intro</p>
            <p className="text-xs text-muted-foreground">
              {editable ? "Record a short intro (up to 30s)" : "Listen to their voice intro"}
            </p>
          </div>
        </div>

        {isRecording && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10">
            <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium flex-1">Recording... {formatTime(recordingTime)}</span>
            <span className="text-xs text-muted-foreground">{formatTime(MAX_DURATION)}</span>
            <Button
              size="icon"
              variant="destructive"
              onClick={stopRecording}
              data-testid="button-stop-recording"
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>
        )}

        {!isRecording && currentAudioUrl && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => (isPlaying ? pauseAudio() : playAudio(currentAudioUrl))}
              data-testid="button-play-voice"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <div className="flex-1">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: duration > 0 ? `${(playbackTime / duration) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground min-w-[40px] text-right">
              {isPlaying ? formatTime(playbackTime) : formatTime(duration || recordingTime)}
            </span>
          </div>
        )}

        {editable && (
          <div className="flex items-center gap-2 flex-wrap">
            {!isRecording && !recordedUrl && (
              <Button
                variant="outline"
                onClick={startRecording}
                disabled={isUploading}
                data-testid="button-record-voice"
              >
                <Mic className="w-4 h-4 mr-2" />
                {hasExistingIntro ? "Re-record" : "Record"}
              </Button>
            )}

            {recordedUrl && !isRecording && (
              <>
                <Button
                  onClick={uploadVoiceIntro}
                  disabled={isUploading}
                  data-testid="button-save-voice"
                >
                  {isUploading ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={discardRecording}
                  disabled={isUploading}
                  data-testid="button-discard-voice"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Discard
                </Button>
              </>
            )}

            {hasExistingIntro && !recordedUrl && !isRecording && (
              <Button
                variant="outline"
                onClick={deleteVoiceIntro}
                disabled={isUploading}
                className="text-destructive"
                data-testid="button-delete-voice"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function VoiceIntroPlayer({ voiceIntroUrl }: { voiceIntroUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = () => {
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(voiceIntroUrl);
    audioRef.current = audio;
    setIsPlaying(true);
    setPlaybackTime(0);
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setPlaybackTime(audio.currentTime);
    audio.onended = () => { setIsPlaying(false); setPlaybackTime(0); };
    audio.play();
  };

  const pauseAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); setIsPlaying(false); }
  };

  return (
    <div className="flex items-center gap-2" data-testid="voice-intro-player">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => (isPlaying ? pauseAudio() : playAudio())}
        data-testid="button-play-voice-mini"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </Button>
      {isPlaying && (
        <div className="flex-1 max-w-[80px]">
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: duration > 0 ? `${(playbackTime / duration) * 100}%` : "0%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
