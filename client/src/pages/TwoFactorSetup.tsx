import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, ArrowLeft, Loader2, Copy, Check, Mail, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type SetupData = { qrCode: string; secret: string };

type TwoFactorStatus = {
  enabled: boolean;
  verified: boolean;
  method: "totp" | "email" | null;
  destination: string | null;
  hasEmail: boolean;
  required: boolean;
};

type Method = "totp" | "email";

export default function TwoFactorSetup() {
  const [chosen, setChosen] = useState<Method | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: status } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/2fa/status"],
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
  };

  const reset = () => {
    setChosen(null);
    setCode("");
    setSentTo(null);
  };

  // --- Authenticator (TOTP) ---
  const totpSetup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/2fa/setup", {});
      return res.json() as Promise<SetupData>;
    },
    onError: (e: Error) => toast({ title: "Setup Failed", description: e.message, variant: "destructive" }),
  });

  const totpEnable = useMutation({
    mutationFn: async (c: string) => (await apiRequest("POST", "/api/2fa/enable", { code: c })).json(),
    onSuccess: () => {
      toast({ title: "Two-Step Verification Enabled", description: "Your account now has extra security." });
      refresh();
      reset();
    },
    onError: (e: Error) =>
      toast({
        title: "Verification Failed",
        description: e.message.includes("Invalid") ? "The code is incorrect. Check your app and try again." : "Something went wrong.",
        variant: "destructive",
      }),
  });

  // --- Email ---
  const emailSetup = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/2fa/email/setup", {})).json() as Promise<{ destination: string }>,
    onSuccess: (d) => setSentTo(d.destination),
    onError: (e: Error) => toast({ title: "Couldn't send code", description: e.message, variant: "destructive" }),
  });

  const emailEnable = useMutation({
    mutationFn: async (c: string) => (await apiRequest("POST", "/api/2fa/email/enable", { code: c })).json(),
    onSuccess: () => {
      toast({ title: "Email Verification Enabled", description: "We'll email you a code when you sign in." });
      refresh();
      reset();
    },
    onError: (e: Error) =>
      toast({ title: "Verification Failed", description: e.message.includes("Invalid") ? "That code is incorrect." : e.message, variant: "destructive" }),
  });

  // --- Disable ---
  const disable = useMutation({
    mutationFn: async (c: string) => (await apiRequest("POST", "/api/2fa/disable", { code: c })).json(),
    onSuccess: () => {
      toast({ title: "Two-Step Verification Disabled", description: "It has been removed from your account." });
      refresh();
      setDisableCode("");
    },
    onError: (e: Error) =>
      toast({ title: "Failed to Disable", description: e.message.includes("Invalid") ? "The code is incorrect." : e.message, variant: "destructive" }),
  });

  const sendDisableCode = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/2fa/challenge/send", {})).json() as Promise<{ destination: string }>,
    onSuccess: (d) => toast({ title: "Code sent", description: `We sent a code to ${d.destination}.` }),
    onError: (e: Error) => toast({ title: "Couldn't send code", description: e.message, variant: "destructive" }),
  });

  const BackButton = (
    <Button variant="ghost" size="icon" onClick={() => setLocation("/preferences")} className="mb-4" data-testid="button-back">
      <ArrowLeft className="w-5 h-5" />
    </Button>
  );

  const OtpInput = ({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) => (
    <InputOTP maxLength={6} value={value} onChange={onChange} data-testid={testId}>
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );

  // ===================== ENABLED VIEW (disable flow) =====================
  if (status?.enabled) {
    const m = status.method;
    const isDelivery = m === "email";
    const label = m === "email" ? "email" : "authenticator app";
    return (
      <div className="min-h-screen bg-secondary/30 p-4 pb-24">
        <div className="max-w-lg mx-auto">
          {BackButton}
          <Card className="border-none shadow-lg">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <Shield className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl" data-testid="text-2fa-enabled-title">
                Two-Step Verification is On
              </CardTitle>
              <CardDescription>
                You're protected with your {label}
                {status.destination ? ` (${status.destination})` : ""}. To turn it off, verify a code below.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-5 pb-6">
              {isDelivery && (
                <Button
                  variant="outline"
                  onClick={() => sendDisableCode.mutate()}
                  disabled={sendDisableCode.isPending}
                  className="w-full max-w-xs"
                  data-testid="button-send-disable-code"
                >
                  {sendDisableCode.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send me a code
                </Button>
              )}
              <OtpInput value={disableCode} onChange={setDisableCode} testId="input-2fa-disable-code" />
              <Button
                variant="destructive"
                onClick={() => disableCode.length === 6 && disable.mutate(disableCode)}
                disabled={disableCode.length !== 6 || disable.isPending}
                className="w-full max-w-xs"
                data-testid="button-disable-2fa"
              >
                {disable.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Disable Two-Step Verification
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ===================== METHOD CHOOSER =====================
  if (!chosen) {
    return (
      <div className="min-h-screen bg-secondary/30 p-4 pb-24">
        <div className="max-w-lg mx-auto">
          {BackButton}
          <Card className="border-none shadow-lg">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Shield className="w-7 h-7 text-primary" />
              </div>
              <CardTitle className="text-xl" data-testid="text-2fa-setup-title">
                Set Up Two-Step Verification
              </CardTitle>
              <CardDescription>Choose how you'd like to receive your sign-in codes.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pb-6">
              <button
                onClick={() => setChosen("email")}
                disabled={!status?.hasEmail}
                className="flex items-center gap-3 p-4 rounded-lg border bg-card text-left hover-elevate disabled:opacity-50"
                data-testid="button-choose-email"
              >
                <Mail className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <div className="font-medium">Email</div>
                  <div className="text-sm text-muted-foreground">Get a code sent to your email address.</div>
                </div>
              </button>

              <button
                onClick={() => setChosen("totp")}
                className="flex items-center gap-3 p-4 rounded-lg border bg-card text-left hover-elevate"
                data-testid="button-choose-totp"
              >
                <Smartphone className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <div className="font-medium">Authenticator app</div>
                  <div className="text-sm text-muted-foreground">Use Google Authenticator, Authy, etc.</div>
                </div>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ===================== PER-METHOD SETUP =====================
  return (
    <div className="min-h-screen bg-secondary/30 p-4 pb-24">
      <div className="max-w-lg mx-auto">
        <Button variant="ghost" size="icon" onClick={reset} className="mb-4" data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <Card className="border-none shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              {chosen === "email" ? <Mail className="w-7 h-7 text-primary" /> : <Smartphone className="w-7 h-7 text-primary" />}
            </div>
            <CardTitle className="text-xl">
              {chosen === "email" ? "Email Verification" : "Authenticator App"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5 pb-6">
            {/* EMAIL */}
            {chosen === "email" && (
              <>
                {!sentTo ? (
                  <>
                    <p className="text-sm text-muted-foreground text-center">We'll send a 6-digit code to your account email.</p>
                    <Button onClick={() => emailSetup.mutate()} disabled={emailSetup.isPending} className="w-full max-w-xs" data-testid="button-send-email-code">
                      {emailSetup.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Send code
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground text-center">Enter the 6-digit code we sent to {sentTo}.</p>
                    <OtpInput value={code} onChange={setCode} testId="input-email-code" />
                    <Button onClick={() => code.length === 6 && emailEnable.mutate(code)} disabled={code.length !== 6 || emailEnable.isPending} className="w-full max-w-xs" data-testid="button-enable-email">
                      {emailEnable.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Turn On
                    </Button>
                    <Button variant="ghost" className="text-sm" onClick={() => { setCode(""); emailSetup.mutate(); }} disabled={emailSetup.isPending} data-testid="button-resend-email">
                      Resend code
                    </Button>
                  </>
                )}
              </>
            )}

            {/* TOTP */}
            {chosen === "totp" && (
              <>
                {!totpSetup.data ? (
                  <>
                    <div className="text-sm text-muted-foreground text-center space-y-2">
                      <p>You'll need an authenticator app like:</p>
                      <ul className="space-y-1">
                        <li>Google Authenticator</li>
                        <li>Microsoft Authenticator</li>
                        <li>Authy</li>
                      </ul>
                    </div>
                    <Button onClick={() => totpSetup.mutate()} disabled={totpSetup.isPending} className="w-full max-w-xs" data-testid="button-start-2fa-setup">
                      {totpSetup.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Get Started
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground text-center">
                      <p className="font-medium text-foreground mb-2">Step 1: Scan this QR code</p>
                    </div>
                    <div className="bg-card p-4 rounded-md" data-testid="img-2fa-qr-code">
                      <img src={totpSetup.data.qrCode} alt="QR Code for authenticator app" className="w-48 h-48" />
                    </div>
                    <div className="w-full max-w-xs">
                      <p className="text-xs text-muted-foreground text-center mb-2">Or enter this key manually:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted p-2 rounded-md text-center font-mono break-all" data-testid="text-2fa-secret">
                          {totpSetup.data.secret}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            navigator.clipboard.writeText(totpSetup.data!.secret);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          data-testid="button-copy-secret"
                        >
                          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground text-center mt-2">
                      <p className="font-medium text-foreground mb-2">Step 2: Enter the 6-digit code</p>
                    </div>
                    <OtpInput value={code} onChange={setCode} testId="input-2fa-setup-code" />
                    <Button onClick={() => code.length === 6 && totpEnable.mutate(code)} disabled={code.length !== 6 || totpEnable.isPending} className="w-full max-w-xs" data-testid="button-enable-2fa">
                      {totpEnable.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Enable Two-Step Verification
                    </Button>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
