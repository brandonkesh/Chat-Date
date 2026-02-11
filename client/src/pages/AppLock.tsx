import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Heart, Lock, KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AppLockProps {
  onUnlock: () => void;
}

export default function AppLock({ onUnlock }: AppLockProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"verify" | "recover">("verify");
  const [backupCode, setBackupCode] = useState("");
  const { toast } = useToast();

  const verifyMutation = useMutation({
    mutationFn: async (pwd: string) => {
      const res = await apiRequest("POST", "/api/password/verify", { password: pwd });
      return res.json();
    },
    onSuccess: () => {
      onUnlock();
    },
    onError: () => {
      toast({ title: "Incorrect password", description: "Please try again.", variant: "destructive" });
      setPassword("");
    },
  });

  const recoverMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/password/recover", { backupCode: code });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Password removed",
        description: `You can set a new password in your settings. ${data.remainingCodes} backup codes remaining.`,
      });
      onUnlock();
    },
    onError: () => {
      toast({ title: "Invalid backup code", description: "Please check your code and try again.", variant: "destructive" });
      setBackupCode("");
    },
  });

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length > 0) {
      verifyMutation.mutate(password);
    }
  };

  const handleRecover = (e: React.FormEvent) => {
    e.preventDefault();
    if (backupCode.length > 0) {
      recoverMutation.mutate(backupCode);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Heart className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold">Crush</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="w-4 h-4" />
            <span className="text-sm">App Locked</span>
          </div>
        </div>

        {mode === "verify" ? (
          <Card className="p-6">
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="lock-password">Enter your password</label>
                <div className="relative">
                  <Input
                    id="lock-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your app password"
                    autoFocus
                    data-testid="input-lock-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password-visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={verifyMutation.isPending || password.length === 0}
                data-testid="button-unlock"
              >
                {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => setMode("recover")}
                data-testid="button-forgot-password"
              >
                Forgot password?
              </button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Recover Account</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Enter one of the backup codes you received when setting up your password.
            </p>
            <form onSubmit={handleRecover} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="backup-code">Backup Code</label>
                <Input
                  id="backup-code"
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3D4"
                  className="font-mono tracking-wider"
                  autoFocus
                  data-testid="input-backup-code"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={recoverMutation.isPending || backupCode.length === 0}
                data-testid="button-recover"
              >
                {recoverMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Recover Account"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                className="text-sm text-muted-foreground hover:underline"
                onClick={() => setMode("verify")}
                data-testid="button-back-to-password"
              >
                Back to password
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
