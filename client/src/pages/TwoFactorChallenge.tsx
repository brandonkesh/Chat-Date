import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TwoFactorChallenge() {
  const [code, setCode] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setCode("");
    },
  });

  const handleSubmit = () => {
    if (code.length === 6) {
      verifyMutation.mutate(code);
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-none shadow-xl">
        <CardHeader className="text-center pb-6 pt-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold" data-testid="text-2fa-title">
            Two-Step Verification
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Enter the 6-digit code from your authenticator app to continue.
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

          <p className="text-sm text-muted-foreground text-center">
            Open your authenticator app (like Google Authenticator) and enter the code shown for Crush Dating.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
