import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Profile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, ShieldCheck, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function SecondChance() {
  const { toast } = useToast();
  const { data: profiles, isLoading } = useQuery<Profile[]>({
    queryKey: ["/api/second-chance"],
  });

  const { mutate: bringBack, isPending } = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", "/api/second-chance/undo", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/second-chance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      toast({
        title: "They're back! 💫",
        description: "You'll see them in your feed again.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Couldn't bring them back. Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pb-24" data-testid="page-second-chance">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center">
          <RotateCcw className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-3xl font-display font-bold">Second Chance</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Changed your mind about someone you passed on? Bring them back to your feed.
      </p>

      {!profiles || profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
            <Heart className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2" data-testid="text-empty-second-chance">No passed profiles</h2>
          <p className="text-muted-foreground mb-6">You haven't passed on anyone yet. Keep swiping!</p>
          <Link href="/feed">
            <Button data-testid="button-go-feed">Go to Feed</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="grid-second-chance">
          {profiles.map((profile) => (
            <Card key={profile.id} className="overflow-hidden" data-testid={`card-second-chance-${profile.id}`}>
              <div className="relative aspect-[3/4]">
                <img
                  src={profile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`}
                  alt={profile.displayName}
                  className="w-full h-full object-cover bg-secondary"
                />
                {profile.isVerified && (
                  <Badge className="absolute top-2 right-2 bg-blue-500 text-white border-none text-[10px]">
                    <ShieldCheck className="w-3 h-3 mr-0.5" />
                    Verified
                  </Badge>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8">
                  <p className="text-white font-bold text-sm truncate" data-testid={`text-second-chance-name-${profile.id}`}>
                    {profile.displayName}, {profile.age}
                  </p>
                </div>
              </div>
              <div className="p-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={isPending}
                  onClick={() => bringBack(profile.userId)}
                  data-testid={`button-bring-back-${profile.id}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Bring back
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
