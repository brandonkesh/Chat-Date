import { useRoute, useLocation } from "wouter";
import { useMatch, useMyProfile } from "@/hooks/use-dating";
import { Button } from "@/components/ui/button";
import { Loader2, PhoneOff, Mic, MicOff, Video, VideoOff, ArrowLeft } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

export default function VideoCall() {
  const [, params] = useRoute("/video/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id || "0");
  const { toast } = useToast();
  
  const { data: profile } = useMyProfile();
  const { data: matchData, isLoading } = useMatch(matchId);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
        setIsCallActive(true);
        setConnectionStatus("Connected");
      }
    };
    
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsCallActive(true);
        setConnectionStatus("Connected");
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionStatus("Disconnected");
        setIsCallActive(false);
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
    if (!profile || !matchId) return;
    
    let mounted = true;
    
    const initCall = async () => {
      const stream = await setupMediaStream();
      if (!stream || !mounted) return;
      
      // Get video call token from server
      let callToken: string;
      try {
        const tokenResponse = await fetch('/api/video-call/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ matchId })
        });
        
        if (!tokenResponse.ok) {
          throw new Error('Failed to get video call token');
        }
        
        const tokenData = await tokenResponse.json();
        callToken = tokenData.token;
      } catch (error) {
        toast({
          title: "Connection Error",
          description: "Could not authorize video call. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      const pc = createPeerConnection(stream);
      
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus("Waiting for partner...");
        ws.send(JSON.stringify({
          type: 'join',
          matchId: matchId.toString(),
          token: callToken
        }));
      };
      
      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'user-joined':
            setConnectionStatus("Partner joined, connecting...");
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
            
          case 'user-left':
            setConnectionStatus("Partner left the call");
            setIsCallActive(false);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
            }
            break;
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus("Disconnected");
      };
      
      ws.onerror = () => {
        toast({
          title: "Connection Error",
          description: "Failed to connect to video call server.",
          variant: "destructive",
        });
      };
    };
    
    initCall();
    
    return () => {
      mounted = false;
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'leave' }));
        wsRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [profile, matchId, setupMediaStream, createPeerConnection, startCall, toast]);

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
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'leave' }));
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

  if (isLoading || !profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
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
        <div className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm">
          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isCallActive ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
          {connectionStatus}
        </div>
      </div>

      <div className="flex-1 relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          data-testid="video-remote"
        />
        
        {!isCallActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
            <img 
              src={partnerProfile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerProfile.displayName}`} 
              alt={partnerProfile.displayName}
              className="w-32 h-32 rounded-full object-cover border-4 border-white/20 mb-4"
            />
            <h2 className="text-white text-xl font-semibold mb-2">{partnerProfile.displayName}</h2>
            <p className="text-white/60 text-sm">{connectionStatus}</p>
          </div>
        )}

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
      </div>

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
    </div>
  );
}
