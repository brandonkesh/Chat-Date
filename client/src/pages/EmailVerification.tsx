import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Mail, ArrowLeft, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

type EmailVerificationStatus = {
  emailVerified: boolean;
  email: string | null;
  codeSent: boolean;
  codeExpiry: string | null;
};

type SendCodeResponse = {
  success: boolean;
  message: string;
  email: string;
};

export default function EmailVerification() {
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<EmailVerificationStatus>({
    queryKey: ["/api/email-verification/status"],
  });

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email-verification/send", {});
      return res.json() as Promise<SendCodeResponse>;
    },
    onSuccess: (data) => {
      setCodeRequested(true);
      toast({
        title: "Code Sent",
        description: `Verification code sent to ${data.email}. Check your inbox.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-verification/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      const res = await apiRequest("POST", "/api/email-verification/verify", { code: verificationCode });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Email Verified",
        description: "Your email has been verified successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-verification/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      setCodeRequested(false);
      setCode("");
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message.includes("Invalid")
          ? "The code you entered is incorrect. Please try again."
          : error.message.includes("expired")
          ? "The code has expired. Please request a new one."
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setCode("");
    },
  });

  const handleVerify = () => {
    if (code.length === 6) {
      verifyMutation.mutate(code);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (status?.emailVerified) {
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
                <Mail className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl" data-testid="text-email-verified-title">
                Email Verified
              </CardTitle>
              <CardDescription>
                Your email address has been verified.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pb-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{status.email}</span>
                <Badge variant="secondary">
                  <Check className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              </div>
              <Button
                variant="outline"
                onClick={() => setLocation("/preferences")}
                className="w-full max-w-xs"
                data-testid="button-back-to-preferences"
              >
                Back to Preferences
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
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl" data-testid="text-email-verify-title">
              Verify Your Email
            </CardTitle>
            <CardDescription>
              {status?.email
                ? `Verify your email address (${status.email}) to secure your account.`
                : "Verify your email address to secure your account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5 pb-6">
            {!(codeRequested || status?.codeSent) ? (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  We'll send a 6-digit verification code to your email address. The code will be valid for 10 minutes.
                </p>
                <Button
                  onClick={() => sendCodeMutation.mutate()}
                  disabled={sendCodeMutation.isPending}
                  className="w-full max-w-xs"
                  data-testid="button-send-code"
                >
                  {sendCodeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Send Verification Code
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground text-center" data-testid="text-code-sent">
                  {codeRequested
                    ? "A 6-digit code has been sent to your email. Check your inbox and enter it below."
                    : "A verification code was already sent to your email. Enter it below, or request a new one."}
                </p>

                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  data-testid="input-email-code"
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
                  onClick={handleVerify}
                  disabled={code.length !== 6 || verifyMutation.isPending}
                  className="w-full max-w-xs"
                  data-testid="button-verify-email"
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Verify Email
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => {
                    setCode("");
                    sendCodeMutation.mutate();
                  }}
                  disabled={sendCodeMutation.isPending}
                  className="text-sm"
                  data-testid="button-resend-code"
                >
                  Resend Code
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
