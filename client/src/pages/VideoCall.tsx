import { useRoute, useLocation } from "wouter";
import { useMatch, useMyProfile } from "@/hooks/use-dating";
import { Button } from "@/components/ui/button";
import { Loader2, PhoneOff, Phone, Mic, MicOff, Video, VideoOff, ArrowLeft } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { motion } from "framer-motion";

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

export default function VideoCall() {
  const [, params] = useRoute("/video-call/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id || "0");
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const isInitiator = searchParams.get("role") === "caller";
  const isAccepted = searchParams.get("accepted") === "true";

  const { data: profile } = useMyProfile();
  const { data: matchData, isLoading } = useMatch(matchId);

  const [callPhase, setCallPhase] = useState<"ringing" | "incoming" | "connecting" | "active" | "ended" | "declined">(
    isInitiator ? "ringing" : (isAccepted ? "connecting" : "incoming")
  );
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCallerInfo, setIncomingCallerInfo] = useState<{ callerName: string; callerPhoto: string | null } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callPhaseRef = useRef(callPhase);
  const abortedRef = useRef(false);

  const setupMediaStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error("Failed to get media stream:", error);
      toast({
        title: "Camera/Microphone Error",
        description: "Please allow access to your camera and microphone.",
        variant: "destructive",
      });
      return null;
    }
  }, [toast]);

  const createPeerConnection = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate
        }));
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setCallPhase("active");
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallPhase("active");
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setCallPhase("ended");
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, []);

  const startCall = useCallback(async () => {
    if (!peerConnectionRef.current) return;

    try {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'offer',
          offer: offer
        }));
      }
    } catch (error) {
      console.error("Failed to create offer:", error);
    }
  }, []);

  useEffect(() => {
    callPhaseRef.current = callPhase;
    if (callPhase !== "ringing" && ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (callPhase === "active") {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callPhase]);

  useEffect(() => {
    if (!isInitiator || !matchId || callPhase !== "ringing") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/video-call/invite-status/${matchId}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "gone" && callPhaseRef.current === "ringing") {
            setCallPhase("declined");
            toast({ title: "Call Declined", description: "Your match declined the video call." });
            setTimeout(() => navigate(`/chat/${matchId}`), 2000);
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [isInitiator, matchId, callPhase, navigate, toast]);

  const connectToSignalingServer = useCallback(async () => {
    const stream = await setupMediaStream();
    if (!stream || abortedRef.current) {
      if (stream && abortedRef.current) {
        stream.getTracks().forEach(track => track.stop());
      }
      return;
    }

    let callToken: string;
    try {
      const tokenResponse = await fetch('/api/video-call/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matchId })
      });

      if (abortedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      if (!tokenResponse.ok) {
        const errData = await tokenResponse.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get video call token');
      }

      const tokenData = await tokenResponse.json();
      callToken = tokenData.token;
    } catch (error: any) {
      stream.getTracks().forEach(track => track.stop());
      toast({
        title: "Connection Error",
        description: error.message || "Could not authorize video call.",
        variant: "destructive",
      });
      return;
    }

    if (abortedRef.current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    const pc = createPeerConnection(stream);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (callPhaseRef.current !== "ringing") {
        setCallPhase("connecting");
      }
      ws.send(JSON.stringify({
        type: 'join',
        matchId: matchId.toString(),
        token: callToken
      }));
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'incoming-call':
          setIncomingCallerInfo({
            callerName: message.callerName,
            callerPhoto: message.callerPhoto,
          });
          break;

        case 'user-joined':
          setCallPhase("connecting");
          await startCall();
          break;

        case 'offer':
          if (pc.signalingState !== 'stable') return;
          await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({
            type: 'answer',
            answer: answer
          }));
          break;

        case 'answer':
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
          }
          break;

        case 'ice-candidate':
          if (message.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          }
          break;

        case 'call-declined':
          setCallPhase("declined");
          toast({
            title: "Call Declined",
            description: "Your match declined the video call.",
          });
          setTimeout(() => navigate(`/chat/${matchId}`), 2000);
          break;

        case 'user-left':
          setCallPhase("ended");
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }
          break;
      }
    };

    ws.onclose = () => {
      if (callPhaseRef.current !== "ended" && callPhaseRef.current !== "declined") {
        setCallPhase("ended");
      }
    };

    ws.onerror = () => {
      toast({
        title: "Connection Error",
        description: "Failed to connect to video call server.",
        variant: "destructive",
      });
    };
  }, [matchId, setupMediaStream, createPeerConnection, startCall, toast, navigate]);

  useEffect(() => {
    if (!profile || !matchId) return;
    if (!isInitiator && !isAccepted) return;

    connectToSignalingServer();

    ringTimeoutRef.current = setTimeout(() => {
      if (callPhaseRef.current === "ringing") {
        setCallPhase("ended");
        toast({
          title: "No Answer",
          description: "Your match didn't pick up.",
        });
        setTimeout(() => navigate(`/chat/${matchId}`), 2000);
      }
    }, 60000);

    return () => {
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'leave' }));
        } catch {}
        wsRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [profile, matchId, isInitiator, isAccepted, connectToSignalingServer, toast, navigate]);

  useEffect(() => {
    return () => {
      abortedRef.current = true;
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'leave' }));
        } catch {}
        wsRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const acceptIncomingCall = useCallback(() => {
    setCallPhase("connecting");
    connectToSignalingServer();
  }, [connectToSignalingServer]);

  const declineIncomingCall = useCallback(() => {
    setCallPhase("declined");
    apiRequest("POST", "/api/video-call/decline", { matchId }).catch(() => {});
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'call-declined' }));
      } catch {}
    }
    setTimeout(() => navigate(`/chat/${matchId}`), 1500);
  }, [matchId, navigate]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const endCall = () => {
    if (isInitiator && callPhase === "ringing") {
      apiRequest("POST", "/api/video-call/cancel", { matchId }).catch(() => {});
    }
    if (!isInitiator && callPhase === "incoming") {
      apiRequest("POST", "/api/video-call/decline", { matchId }).catch(() => {});
    }
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'leave' }));
      } catch {}
      wsRef.current.close();
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    navigate(`/chat/${matchId}`);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading || !profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  if (profile?.membershipTier !== 'elite') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
        <p className="text-lg font-semibold">Video Chat is an Elite Feature</p>
        <p className="text-white/60 text-sm text-center max-w-xs">Upgrade to Elite to unlock video calls with your matches.</p>
        <Link href="/premium">
          <Button variant="secondary" data-testid="button-upgrade-elite">Upgrade to Elite</Button>
        </Link>
      </div>
    );
  }

  if (!matchData) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white">
        <p>Match not found</p>
        <Link href="/matches">
          <Button variant="secondary" className="mt-4">Back to Matches</Button>
        </Link>
      </div>
    );
  }

  const { partnerProfile } = matchData;
  const partnerAvatar = partnerProfile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerProfile.displayName}`;

  return (
    <div className="h-screen bg-black flex flex-col" data-testid="page-video-call">
      <div className="absolute top-4 left-4 z-20">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={endCall}
          data-testid="button-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm flex items-center gap-2">
          {callPhase === "active" ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {formatDuration(callDuration)}
            </>
          ) : callPhase === "ringing" ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              Calling...
            </>
          ) : callPhase === "incoming" ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Incoming Call
            </>
          ) : callPhase === "connecting" ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Connecting...
            </>
          ) : callPhase === "declined" ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              Call Declined
            </>
          ) : (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              Call Ended
            </>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${callPhase !== "active" ? 'hidden' : ''}`}
          data-testid="video-remote"
        />

        {callPhase !== "active" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
            {callPhase === "ringing" && (
              <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative mb-6"
                >
                  <div className="absolute inset-0 rounded-full bg-green-500/20 scale-150 animate-pulse" />
                  <img
                    src={partnerAvatar}
                    alt={partnerProfile.displayName}
                    className="w-32 h-32 rounded-full object-cover border-4 border-green-500/40 relative z-10"
                  />
                </motion.div>
                <h2 className="text-white text-2xl font-semibold mb-2" data-testid="text-partner-name">{partnerProfile.displayName}</h2>
                <p className="text-white/60 text-sm mb-8">Calling...</p>
                <Button
                  variant="destructive"
                  size="icon"
                  className="w-16 h-16 rounded-full"
                  onClick={endCall}
                  data-testid="button-cancel-call"
                >
                  <PhoneOff className="w-7 h-7" />
                </Button>
                <p className="text-white/40 text-xs mt-3">Tap to cancel</p>
              </motion.div>
            )}

            {callPhase === "incoming" && (
              <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative mb-6"
                >
                  <div className="absolute inset-0 rounded-full bg-green-500/20 scale-150 animate-pulse" />
                  <img
                    src={incomingCallerInfo?.callerPhoto || partnerAvatar}
                    alt={incomingCallerInfo?.callerName || partnerProfile.displayName}
                    className="w-32 h-32 rounded-full object-cover border-4 border-green-500/40 relative z-10"
                  />
                </motion.div>
                <h2 className="text-white text-2xl font-semibold mb-2" data-testid="text-incoming-caller-name">
                  {incomingCallerInfo?.callerName || partnerProfile.displayName}
                </h2>
                <p className="text-white/60 text-sm mb-8">Incoming Video Call...</p>
                <div className="flex items-center gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="w-16 h-16 rounded-full"
                      onClick={declineIncomingCall}
                      data-testid="button-decline-incoming"
                    >
                      <PhoneOff className="w-7 h-7" />
                    </Button>
                    <span className="text-white/60 text-xs">Decline</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      size="icon"
                      className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white"
                      onClick={acceptIncomingCall}
                      data-testid="button-accept-incoming"
                    >
                      <Phone className="w-7 h-7" />
                    </Button>
                    <span className="text-white/60 text-xs">Accept</span>
                  </div>
                </div>
              </motion.div>
            )}

            {callPhase === "connecting" && (
              <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <img
                  src={partnerAvatar}
                  alt={partnerProfile.displayName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-blue-500/40 mb-4"
                />
                <h2 className="text-white text-xl font-semibold mb-2">{partnerProfile.displayName}</h2>
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <p className="text-white/60 text-sm">Connecting...</p>
                </div>
              </motion.div>
            )}

            {(callPhase === "ended" || callPhase === "declined") && (
              <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <img
                  src={partnerAvatar}
                  alt={partnerProfile.displayName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-white/20 mb-4 grayscale"
                />
                <h2 className="text-white text-xl font-semibold mb-2">{partnerProfile.displayName}</h2>
                <p className="text-white/60 text-sm mb-4">
                  {callPhase === "declined" ? "Call was declined" : "Call ended"}
                  {callDuration > 0 && ` · ${formatDuration(callDuration)}`}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/chat/${matchId}`)}
                  data-testid="button-back-to-chat"
                >
                  Back to Chat
                </Button>
              </motion.div>
            )}
          </div>
        )}

        {callPhase === "active" && (
          <div className="absolute bottom-24 right-4 w-28 h-40 md:w-36 md:h-48 rounded-xl overflow-hidden border-2 border-white/30 shadow-xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
              data-testid="video-local"
            />
            {isVideoOff && (
              <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                <VideoOff className="w-8 h-8 text-white/50" />
              </div>
            )}
          </div>
        )}

        {callPhase !== "active" && (
          <div className="absolute bottom-24 right-4 w-28 h-40 md:w-36 md:h-48 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
              data-testid="video-local-preview"
            />
            {isVideoOff && (
              <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                <VideoOff className="w-8 h-8 text-white/50" />
              </div>
            )}
          </div>
        )}
      </div>

      {(callPhase === "active" || callPhase === "connecting") && (
        <div className="flex-none p-6 flex items-center justify-center gap-4 bg-gradient-to-t from-black to-transparent">
          <Button
            variant="outline"
            size="icon"
            className={`w-14 h-14 rounded-full ${isMuted ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 border-white/20 text-white'}`}
            onClick={toggleMute}
            data-testid="button-mute"
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>

          <Button
            variant="destructive"
            size="icon"
            className="w-16 h-16 rounded-full"
            onClick={endCall}
            data-testid="button-end-call"
          >
            <PhoneOff className="w-7 h-7" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className={`w-14 h-14 rounded-full ${isVideoOff ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 border-white/20 text-white'}`}
            onClick={toggleVideo}
            data-testid="button-video"
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </Button>
        </div>
      )}
    </div>
  );
}
