import { useMatches } from "@/hooks/use-dating";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, MessageCircle, User } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { AdBanner } from "@/components/AdBanner";

export default function Inbox() {
  const { data: matches, isLoading } = useMatches();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const matchesWithMessages = matches?.filter(m => m.lastMessage) || [];
  const hasConversations = matchesWithMessages.length > 0;

  return (
    <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
      <div className="max-w-lg mx-auto p-4">
        <h1 className="text-2xl font-display font-bold mb-6" data-testid="inbox-title">Inbox</h1>

        {!hasConversations ? (
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
            {matchesWithMessages.map((match) => {
              const avatarUrl = match.profile.photoUrl || 
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${match.profile.displayName}`;
              
              return (
                <Link key={match.id} href={`/chat/${match.id}`}>
                  <Card 
                    className="p-4 border-none shadow-sm hover-elevate cursor-pointer"
                    data-testid={`inbox-conversation-${match.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12 border-2 border-background">
                        <AvatarImage src={avatarUrl} alt={match.profile.displayName} />
                        <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold truncate">{match.profile.displayName}</h3>
                          {match.lastMessage && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatDistanceToNow(new Date(match.lastMessage.createdAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        {match.lastMessage && (
                          <p className="text-sm text-muted-foreground truncate">
                            {match.lastMessage.content}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
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
