import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Gift, Copy, Check, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type InviteData = {
  code: string;
  joined: { displayName: string; joinedAt: string | null }[];
};

export default function Invite() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");

  const { data, isLoading } = useQuery<InviteData>({
    queryKey: ["/api/invites/mine"],
  });

  const inviteLink = data ? `${window.location.origin}/?invite=${data.code}` : "";

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied! 📋", description: "Share it with friends you'd love to see on Crush." });
    } catch {
      toast({ title: "Couldn't copy", description: inviteLink });
    }
  };

  const { mutate: redeem, isPending: redeeming } = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/invites/redeem", { code });
      return res.json();
    },
    onSuccess: (result: { redeemed: boolean }) => {
      if (result.redeemed) {
        toast({ title: "Code redeemed! 🎉", description: "You're now connected to your friend's invite." });
        setRedeemCode("");
        queryClient.invalidateQueries({ queryKey: ["/api/invites/mine"] });
      } else {
        toast({
          title: "Hmm, that code didn't work",
          description: "Double-check it — codes can't be your own and only work once.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({ title: "Couldn't redeem", description: "Please try again in a bit.", variant: "destructive" });
    },
  });

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-invite">
      <div className="flex items-center gap-3">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold" data-testid="heading-invite">Invite Friends</h1>
          <p className="text-sm text-muted-foreground">More friends, more matches for everyone 💌</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-accent p-6 text-center text-white">
          <Gift className="w-12 h-12 mx-auto mb-2" />
          <h2 className="font-display text-lg font-bold">Your personal invite link</h2>
          <p className="text-xs text-white/80">Anyone who joins with it shows up in your list below</p>
        </div>
        <CardContent className="p-5 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input value={inviteLink} readOnly className="text-xs font-mono" data-testid="input-invite-link" />
                <Button size="icon" variant="outline" onClick={copyLink} data-testid="button-copy-invite">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-center text-sm">
                Your code: <span className="font-mono font-bold tracking-wider" data-testid="text-invite-code">{data?.code}</span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Got a code from a friend?</CardTitle>
          <CardDescription>Enter it here to connect your accounts</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB23CD45"
            maxLength={20}
            className="font-mono tracking-wider"
            data-testid="input-redeem-code"
          />
          <Button
            onClick={() => redeemCode.trim() && redeem(redeemCode.trim())}
            disabled={redeeming || !redeemCode.trim()}
            data-testid="button-redeem-code"
          >
            {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redeem"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Friends who joined</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : !data || data.joined.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No one yet — share your link and watch this space! 👀
            </p>
          ) : (
            <div className="space-y-2">
              {data.joined.map((j, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50" data-testid={`joined-friend-${i}`}>
                  <p className="text-sm font-medium">{j.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.joinedAt ? formatDistanceToNow(new Date(j.joinedAt), { addSuffix: true }) : "recently"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
