import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type TwoFactorStatus = {
  enabled: boolean;
  verified: boolean;
  method: "totp" | "email" | null;
  destination: string | null;
};

export default function TwoFactorChallenge() {
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const autoSent = useRef(false);

  const { data: status } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/2fa/status"],
  });

  const method = status?.method ?? null;
  const isDelivery = method === "email";

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/2fa/challenge/send", {});
      return res.json() as Promise<{ destination: string }>;
    },
    onSuccess: (data) => {
      setSentTo(data.destination);
    },
    onError: () => {
      toast({
        title: "Couldn't send code",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      const res = await apiRequest("POST", "/api/2fa/verify", { code: verificationCode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message.includes("Invalid")
          ? "The code you entered is incorrect. Please try again."
          : error.message.includes("expired")
          ? "That code expired. Tap Resend to get a new one."
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setCode("");
    },
  });

  // For email, automatically send a code once when the screen loads.
  useEffect(() => {
    if (isDelivery && !autoSent.current) {
      autoSent.current = true;
      sendMutation.mutate();
    }
  }, [isDelivery]);

  const handleSubmit = () => {
    if (code.length === 6) {
      verifyMutation.mutate(code);
    }
  };

  const Icon = method === "email" ? Mail : Shield;

  const description = isDelivery
    ? sentTo
      ? `We sent a 6-digit code to ${sentTo}. Enter it below to continue.`
      : "Sending you a verification code…"
    : "Enter the 6-digit code from your authenticator app to continue.";

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-none shadow-xl">
        <CardHeader className="text-center pb-6 pt-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold" data-testid="text-2fa-title">
            Two-Step Verification
          </CardTitle>
          <CardDescription className="text-base mt-2" data-testid="text-2fa-description">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 pb-8">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            data-testid="input-2fa-code"
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
            onClick={handleSubmit}
            disabled={code.length !== 6 || verifyMutation.isPending}
            className="w-full max-w-xs"
            data-testid="button-verify-2fa"
          >
            {verifyMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Verify
          </Button>

          {isDelivery ? (
            <Button
              variant="ghost"
              onClick={() => {
                setCode("");
                sendMutation.mutate();
              }}
              disabled={sendMutation.isPending}
              className="text-sm"
              data-testid="button-resend-code"
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Resend code
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Open your authenticator app (like Google Authenticator) and enter the code shown for Crush Dating.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
