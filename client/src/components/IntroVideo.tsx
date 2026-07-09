import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Video, Square, Play, Pause, Trash2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface IntroVideoProps {
  introVideoUrl?: string | null;
  editable?: boolean;
}

export function IntroVideo({ introVideoUrl, editable = false }: IntroVideoProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const { toast } = useToast();

  const MAX_DURATION = 30;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [recordedUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      liveStreamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play();
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        stream.getTracks().forEach((t) => t.stop());
        liveStreamRef.current = null;
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
        title: "Camera Access",
        description: "Please allow camera and microphone access to record your intro video.",
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

  const discardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingTime(0);
  };

  const uploadIntroVideo = async () => {
    if (!recordedBlob) return;
    setIsUploading(true);
    try {
      const mimeType = recordedBlob.type || "video/webm";
      const res = await apiRequest("POST", "/api/uploads/intro-video", {
        size: recordedBlob.size,
        contentType: mimeType,
      });
      const { uploadURL, objectPath } = await res.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: recordedBlob,
        headers: { "Content-Type": mimeType },
      });

      if (!uploadRes.ok) {
        throw new Error("Upload failed");
      }

      const verifyRes = await apiRequest("POST", "/api/uploads/verify", { objectPath });
      if (!verifyRes.ok) {
        const verifyData = await verifyRes.json().catch(() => ({}));
        throw new Error((verifyData as any).error || "Upload verification failed");
      }

      await apiRequest("PUT", "/api/profiles/intro-video", {
        introVideoUrl: objectPath,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      discardRecording();
      toast({
        title: "Intro Video Saved",
        description: "Your intro video has been uploaded successfully.",
      });
    } catch {
      toast({
        title: "Upload Failed",
        description: "Could not upload your intro video. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteIntroVideo = async () => {
    setIsUploading(true);
    try {
      await apiRequest("PUT", "/api/profiles/intro-video", {
        introVideoUrl: null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({
        title: "Intro Video Removed",
        description: "Your intro video has been deleted.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Could not remove intro video.",
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

  const hasExistingVideo = !!introVideoUrl && !recordedUrl;

  if (!editable && !introVideoUrl) return null;

  return (
    <Card data-testid="card-intro-video">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Video className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">Intro Video</p>
            <p className="text-xs text-muted-foreground">
              {editable ? "Record a short video intro (up to 30s)" : "Watch their intro video"}
            </p>
          </div>
        </div>

        {isRecording && (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[300px] mx-auto">
              <video
                ref={liveVideoRef}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
                <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                <span className="text-xs text-white font-medium">{formatTime(recordingTime)}</span>
                <span className="text-xs text-white/60">/ {formatTime(MAX_DURATION)}</span>
              </div>
            </div>
            <div className="flex justify-center">
              <Button
                variant="destructive"
                onClick={stopRecording}
                data-testid="button-stop-video-recording"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop Recording
              </Button>
            </div>
          </div>
        )}

        {!isRecording && recordedUrl && (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[300px] mx-auto">
              <video
                ref={previewVideoRef}
                src={recordedUrl}
                className="w-full h-full object-cover"
                controls
                playsInline
                data-testid="video-preview-recorded"
              />
            </div>
          </div>
        )}

        {!isRecording && !recordedUrl && hasExistingVideo && (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[300px] mx-auto">
            <video
              src={introVideoUrl!}
              className="w-full h-full object-cover"
              controls
              playsInline
              data-testid="video-existing-intro"
            />
          </div>
        )}

        {!isRecording && !recordedUrl && !hasExistingVideo && !editable && null}

        {editable && (
          <div className="flex items-center gap-2 flex-wrap">
            {!isRecording && !recordedUrl && (
              <Button
                variant="outline"
                onClick={startRecording}
                disabled={isUploading}
                data-testid="button-record-video"
              >
                <Video className="w-4 h-4 mr-2" />
                {hasExistingVideo ? "Re-record" : "Record"}
              </Button>
            )}

            {recordedUrl && !isRecording && (
              <>
                <Button
                  onClick={uploadIntroVideo}
                  disabled={isUploading}
                  data-testid="button-save-video"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={discardRecording}
                  disabled={isUploading}
                  data-testid="button-discard-video"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Discard
                </Button>
              </>
            )}

            {hasExistingVideo && !recordedUrl && !isRecording && (
              <Button
                variant="outline"
                onClick={deleteIntroVideo}
                disabled={isUploading}
                className="text-destructive"
                data-testid="button-delete-video"
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

export function IntroVideoPlayer({ introVideoUrl }: { introVideoUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={togglePlay}
      title="Intro video available"
      data-testid="button-play-intro-video"
    >
      <Video className="w-4 h-4" />
      <video
        ref={videoRef}
        src={introVideoUrl}
        className="hidden"
        onEnded={() => setIsPlaying(false)}
        playsInline
      />
    </Button>
  );
}

export function IntroVideoModal({ introVideoUrl }: { introVideoUrl: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setIsOpen(true)}
        title="Watch intro video"
        data-testid="button-watch-intro-video"
      >
        <Video className="w-4 h-4 text-primary" />
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setIsOpen(false)}
          data-testid="modal-intro-video"
        >
          <div
            className="relative w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={introVideoUrl}
              className="w-full rounded-lg"
              controls
              autoPlay
              playsInline
              data-testid="video-modal-player"
            />
            <Button
              size="icon"
              variant="secondary"
              className="absolute top-2 right-2"
              onClick={() => setIsOpen(false)}
              data-testid="button-close-video-modal"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
