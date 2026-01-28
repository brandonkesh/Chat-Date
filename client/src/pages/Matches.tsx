import { useMatches } from "@/hooks/use-dating";
import { Link } from "wouter";
import { Loader2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Matches() {
  const { data: matches, isLoading } = useMatches();

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 pb-20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="min-h-screen pt-20 pb-20 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <MessageCircle className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-display font-bold mb-2">No matches yet</h2>
        <p className="text-muted-foreground mb-6">Start swiping to find your crush!</p>
        <Link href="/feed" className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity">
          Go to Feed
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pt-20 pb-24">
      <h1 className="text-3xl font-display font-bold mb-6">Matches ({matches.length})</h1>
      
      <div className="grid gap-4">
        {matches.map(({ match, partnerProfile }) => (
          <Link href={`/chat/${match.id}`} key={match.id}>
            <div className="group flex items-center gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer">
              <img 
                src={partnerProfile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerProfile.displayName}`} 
                alt={partnerProfile.displayName} 
                className="w-16 h-16 rounded-full object-cover bg-secondary"
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">
                    {partnerProfile.displayName}, {partnerProfile.age}
                  </h3>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(match.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-muted-foreground truncate text-sm">
                  Click to start chatting...
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
