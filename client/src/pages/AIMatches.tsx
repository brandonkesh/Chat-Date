import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Heart, User, RefreshCw, CheckCircle, Crown } from "lucide-react";
import { useLocation } from "wouter";
import { AdBanner } from "@/components/AdBanner";

interface AIMatch {
  profile: {
    id: number;
    userId: string;
    displayName: string;
    age: number;
    bio: string | null;
    photoUrl: string | null;
    isVerified: boolean;
    isPremium: boolean;
    interests: string[] | null;
  };
  compatibilityScore: number;
  reason: string;
}

interface AIMatchResponse {
  matches: AIMatch[];
  analysis: string;
}

export default function AIMatches() {
  const [, navigate] = useLocation();
  
  const { data, isLoading, refetch, isFetching } = useQuery<AIMatchResponse>({
    queryKey: ["/api/ai-matches"],
    queryFn: async () => {
      const res = await fetch("/api/ai-matches", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get AI matches");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <div className="relative">
          <Sparkles className="w-12 h-12 text-primary animate-pulse" />
        </div>
        <p className="text-muted-foreground">AI is analyzing your perfect matches...</p>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const hasMatches = data?.matches && data.matches.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background pb-24 md:pt-20">
      <div className="max-w-lg mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-display font-bold" data-testid="ai-matches-title">AI Matches</h1>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="refresh-ai-matches"
          >
            <RefreshCw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {data?.analysis && (
          <Card className="p-4 mb-6 border-primary/20 bg-primary/5">
            <p className="text-sm text-foreground" data-testid="ai-analysis">
              {data.analysis}
            </p>
          </Card>
        )}

        {!hasMatches ? (
          <Card className="p-8 text-center border-none shadow-lg">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No AI matches yet</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Complete your profile with interests and a bio to get AI-powered match suggestions.
            </p>
            <Button onClick={() => navigate("/profile/edit")} data-testid="edit-profile-btn">
              Complete Profile
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {data.matches.map((match, index) => {
              const avatarUrl = match.profile.photoUrl || 
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${match.profile.displayName}`;
              
              return (
                <Card 
                  key={match.profile.id}
                  className="overflow-hidden border-none shadow-lg hover-elevate cursor-pointer"
                  data-testid={`ai-match-card-${match.profile.id}`}
                  onClick={() => navigate(`/profile/${match.profile.id}`)}
                >
                  <div className="relative">
                    <div className="absolute top-3 left-3 z-10">
                      <Badge variant="secondary" className="bg-primary text-primary-foreground">
                        <Sparkles className="w-3 h-3 mr-1" />
                        {match.compatibilityScore}% Match
                      </Badge>
                    </div>
                    {index === 0 && (
                      <div className="absolute top-3 right-3 z-10">
                        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-none">
                          Top Pick
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="w-20 h-20 border-2 border-primary/20">
                        <AvatarImage src={avatarUrl} alt={match.profile.displayName} />
                        <AvatarFallback><User className="w-8 h-8" /></AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-lg truncate">
                            {match.profile.displayName}, {match.profile.age}
                          </h3>
                          {match.profile.isVerified && (
                            <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          )}
                          {match.profile.isPremium && (
                            <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {match.reason}
                        </p>
                        
                        {match.profile.interests && match.profile.interests.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {match.profile.interests.slice(0, 3).map((interest, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {interest}
                              </Badge>
                            ))}
                            {match.profile.interests.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{match.profile.interests.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                      <Button 
                        className="flex-1" 
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/profile/${match.profile.id}`);
                        }}
                        data-testid={`view-profile-${match.profile.id}`}
                      >
                        <Heart className="w-4 h-4 mr-2" />
                        View Profile
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          <AdBanner size="rectangle" className="mx-auto" />
        </div>
      </div>
    </div>
  );
}
