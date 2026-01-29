import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMyProfile } from "@/hooks/use-dating";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Camera, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  RefreshCw,
  ShieldCheck,
  X
} from "lucide-react";

const POSES = [
  { id: 1, name: "Thumbs Up", instruction: "Give a thumbs up with your right hand" },
  { id: 2, name: "Peace Sign", instruction: "Show a peace sign with your fingers" },
  { id: 3, name: "Wave", instruction: "Wave at the camera" },
  { id: 4, name: "Smile", instruction: "Give us your best smile" },
];

export default function Verification() {
  const [, setLocation] = useLocation();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { toast } = useToast();
  
  const [step, setStep] = useState<'intro' | 'capture' | 'uploading' | 'submitted'>('intro');
  const [selectedPose, setSelectedPose] = useState(POSES[Math.floor(Math.random() * POSES.length)]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStep('capture');
    } catch (error) {
      toast({
        title: "Camera access required",
        description: "Please allow camera access to verify your profile",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
    }
    
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageData);
    stopCamera();
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    setSelectedPose(POSES[Math.floor(Math.random() * POSES.length)]);
    startCamera();
  }, [startCamera]);

  const submitVerification = useCallback(async () => {
    if (!capturedImage) return;
    
    setIsUploading(true);
    
    try {
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const file = new File([blob], 'verification.jpg', { type: 'image/jpeg' });
      
      const urlResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `verification-${Date.now()}.jpg`,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!urlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await urlResponse.json();

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload verification photo");
      }

      const verifyResponse = await fetch("/api/verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ photoUrl: objectPath }),
      });

      if (!verifyResponse.ok) {
        throw new Error("Failed to submit verification");
      }

      setStep('submitted');
      
      toast({
        title: "Verification submitted",
        description: "Your verification is being reviewed",
      });

      // Poll for verification status update (auto-approval happens in ~3 seconds)
      const pollInterval = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: ['/api/profiles/me'] });
      }, 2000);
      
      // Stop polling after 15 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 15000);
    } catch (error) {
      console.error("Verification error:", error);
      toast({
        title: "Verification failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [capturedImage, toast]);

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profile?.isVerified) {
    return (
      <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
        <div className="max-w-lg mx-auto p-4">
          <Button 
            variant="ghost" 
            className="mb-4"
            onClick={() => setLocation("/feed")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Card className="border-none shadow-xl text-center">
            <CardContent className="pt-8 pb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2">You're Verified!</h2>
              <p className="text-muted-foreground mb-6">
                Your profile has been verified. Other users will see the verification badge on your profile.
              </p>
              <Badge className="bg-blue-500">
                <ShieldCheck className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (profile?.verificationStatus === 'pending') {
    return (
      <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
        <div className="max-w-lg mx-auto p-4">
          <Button 
            variant="ghost" 
            className="mb-4"
            onClick={() => setLocation("/feed")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Card className="border-none shadow-xl text-center">
            <CardContent className="pt-8 pb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2">Verification Pending</h2>
              <p className="text-muted-foreground mb-4">
                Your verification is being reviewed. This usually takes just a few moments.
              </p>
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/profiles/me'] })} data-testid="button-refresh">
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Status
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
      <div className="max-w-lg mx-auto p-4">
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => {
            stopCamera();
            setLocation("/feed");
          }}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="border-none shadow-xl">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-display">Verify Your Profile</CardTitle>
            <CardDescription>
              Prove you're real and get the verified badge
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'intro' && (
              <div className="space-y-6">
                <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold">How it works:</h3>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="font-bold text-primary">1.</span>
                      We'll show you a pose to match
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-primary">2.</span>
                      Take a selfie matching the pose
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-primary">3.</span>
                      Get your verified badge
                    </li>
                  </ol>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Benefits of verification:</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Get more matches with verified profiles
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Build trust with potential matches
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Stand out in the discover feed
                    </li>
                  </ul>
                </div>

                <Button 
                  onClick={startCamera}
                  className="w-full"
                  data-testid="button-start-verification"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Start Verification
                </Button>
              </div>
            )}

            {step === 'capture' && (
              <div className="space-y-4">
                <div className="bg-primary/10 rounded-xl p-4 text-center">
                  <p className="text-sm font-medium text-primary mb-1">Your pose:</p>
                  <p className="text-lg font-bold">{selectedPose.instruction}</p>
                </div>

                <div className="relative aspect-square rounded-xl overflow-hidden bg-black">
                  {capturedImage ? (
                    <img 
                      src={capturedImage} 
                      alt="Captured" 
                      className="w-full h-full object-cover"
                      data-testid="captured-image"
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform scale-x-[-1]"
                      data-testid="video-preview"
                    />
                  )}
                </div>

                <canvas ref={canvasRef} className="hidden" />

                {capturedImage ? (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={retakePhoto}
                      className="flex-1"
                      data-testid="button-retake"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retake
                    </Button>
                    <Button
                      onClick={submitVerification}
                      disabled={isUploading}
                      className="flex-1"
                      data-testid="button-submit-verification"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Submit
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={capturePhoto}
                    className="w-full"
                    data-testid="button-capture"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Capture Photo
                  </Button>
                )}
              </div>
            )}

            {step === 'submitted' && (
              <div className="text-center py-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">Verification Submitted!</h3>
                <p className="text-muted-foreground mb-6">
                  Your verification is being processed. You'll be verified shortly.
                </p>
                <Button
                  onClick={() => setLocation("/feed")}
                  data-testid="button-go-to-feed"
                >
                  Back to Discover
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
