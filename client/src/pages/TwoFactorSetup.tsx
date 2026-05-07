import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, ArrowLeft, Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type SetupData = {
  qrCode: string;
  secret: string;
};

type TwoFactorStatus = {
  enabled: boolean;
  verified: boolean;
};

export default function TwoFactorSetup() {
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: status } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/2fa/status"],
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/2fa/setup", {});
      return res.json() as Promise<SetupData>;
    },
    onError: (error: Error) => {
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      const res = await apiRequest("POST", "/api/2fa/enable", { code: verificationCode });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Two-Step Verification Enabled",
        description: "Your account is now protected with two-step verification.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      setCode("");
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message.includes("Invalid")
          ? "The code is incorrect. Please check your authenticator app and try again."
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setCode("");
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      const res = await apiRequest("POST", "/api/2fa/disable", { code: verificationCode });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Two-Step Verification Disabled",
        description: "Two-step verification has been removed from your account.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      setDisableCode("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Disable",
        description: error.message.includes("Invalid")
          ? "The code is incorrect. Please try again."
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setDisableCode("");
    },
  });

  const handleCopySecret = () => {
    if (setupMutation.data?.secret) {
      navigator.clipboard.writeText(setupMutation.data.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEnable = () => {
    if (code.length === 6) {
      enableMutation.mutate(code);
    }
  };

  const handleDisable = () => {
    if (disableCode.length === 6) {
      disableMutation.mutate(disableCode);
    }
  };

  if (status?.enabled) {
    return (
      <div className="min-h-screen bg-secondary/30 p-4 pb-24">
        <div className="max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/preferences")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <Card className="border-none shadow-lg">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <Shield className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl" data-testid="text-2fa-enabled-title">
                Two-Step Verification is On
              </CardTitle>
              <CardDescription>
                Your account is protected. Enter a code from your authenticator app to disable it.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-5 pb-6">
              <InputOTP
                maxLength={6}
                value={disableCode}
                onChange={setDisableCode}
                data-testid="input-2fa-disable-code"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>

              <Button
                variant="destructive"
                onClick={handleDisable}
                disabled={disableCode.length !== 6 || disableMutation.isPending}
                className="w-full max-w-xs"
                data-testid="button-disable-2fa"
              >
                {disableMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Disable Two-Step Verification
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 pb-24">
      <div className="max-w-lg mx-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/preferences")}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <Card className="border-none shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl" data-testid="text-2fa-setup-title">
              Set Up Two-Step Verification
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account using an authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5 pb-6">
            {!setupMutation.data ? (
              <>
                <div className="text-sm text-muted-foreground text-center space-y-3">
                  <p>You'll need an authenticator app like:</p>
                  <ul className="space-y-1">
                    <li>Google Authenticator</li>
                    <li>Microsoft Authenticator</li>
                    <li>Authy</li>
                  </ul>
                </div>
                <Button
                  onClick={() => setupMutation.mutate()}
                  disabled={setupMutation.isPending}
                  className="w-full max-w-xs"
                  data-testid="button-start-2fa-setup"
                >
                  {setupMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Get Started
                </Button>
              </>
            ) : (
              <>
                <div className="text-sm text-muted-foreground text-center">
                  <p className="font-medium text-foreground mb-2">Step 1: Scan this QR code</p>
                  <p>Open your authenticator app and scan the code below.</p>
                </div>

                <div className="bg-card p-4 rounded-md" data-testid="img-2fa-qr-code">
                  <img
                    src={setupMutation.data.qrCode}
                    alt="QR Code for authenticator app"
                    className="w-48 h-48"
                  />
                </div>

                <div className="w-full max-w-xs">
                  <p className="text-xs text-muted-foreground text-center mb-2">
                    Or enter this key manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code
                      className="flex-1 text-xs bg-muted p-2 rounded-md text-center font-mono break-all"
                      data-testid="text-2fa-secret"
                    >
                      {setupMutation.data.secret}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopySecret}
                      data-testid="button-copy-secret"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground text-center mt-2">
                  <p className="font-medium text-foreground mb-2">Step 2: Enter the code</p>
                  <p>Enter the 6-digit code shown in your authenticator app.</p>
                </div>

                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  data-testid="input-2fa-setup-code"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>

                <Button
                  onClick={handleEnable}
                  disabled={code.length !== 6 || enableMutation.isPending}
                  className="w-full max-w-xs"
                  data-testid="button-enable-2fa"
                >
                  {enableMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Enable Two-Step Verification
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
