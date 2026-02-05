import { useMatches } from "@/hooks/use-dating";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, User, Video } from "lucide-react";
import { Link, useLocation } from "wouter";
import { AdBanner } from "@/components/AdBanner";
import { formatDistanceToNow } from "date-fns";

export default function Inbox() {
  const { data: matches, isLoading } = useMatches();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasMatches = matches && matches.length > 0;

  return (
    <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
      <div className="max-w-lg mx-auto p-4">
        <h1 className="text-2xl font-display font-bold mb-6" data-testid="inbox-title">Inbox</h1>

        {!hasMatches ? (
          <Card className="p-8 text-center border-none shadow-lg">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No messages yet</h2>
            <p className="text-muted-foreground text-sm">
              When you match with someone and start chatting, your conversations will appear here.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {matches.map(({ match, partnerProfile }) => {
              const avatarUrl = partnerProfile.photoUrl || 
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerProfile.displayName}`;
              
              return (
                <Card 
                  key={match.id}
                  className="p-4 border-none shadow-sm hover-elevate cursor-pointer"
                  data-testid={`inbox-conversation-${match.id}`}
                  onClick={() => navigate(`/chat/${match.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12 border-2 border-background">
                      <AvatarImage src={avatarUrl} alt={partnerProfile.displayName} />
                      <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold truncate">{partnerProfile.displayName}, {partnerProfile.age}</h3>
                        {match.createdAt && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatDistanceToNow(new Date(match.createdAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        Tap to start chatting
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="flex-shrink-0"
                      data-testid={`video-call-btn-${match.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/video-call/${match.id}`);
                      }}
                    >
                      <Video className="w-5 h-5 text-primary" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Ad Banner */}
        <div className="mt-6">
          <AdBanner size="rectangle" className="mx-auto" />
        </div>
      </div>
    </div>
  );
}
