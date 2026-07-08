import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Profile } from "@shared/schema";
import { Loader2, Heart, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LikesYou() {
  const { data: likers, isLoading } = useQuery<Profile[]>({
    queryKey: [api.swipes.likesReceived.path],
  });

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="loading-likes">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 md:pb-4 md:pt-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back-feed">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Heart className="w-6 h-6 text-primary fill-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-likes-title">Likes You</h1>
        </div>
        {likers && likers.length > 0 && (
          <Badge variant="secondary" data-testid="badge-likes-count">
            {likers.length}
          </Badge>
        )}
      </div>

      {!likers || likers.length === 0 ? (
        <Card className="p-8 text-center">
          <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2" data-testid="text-no-likes">No likes yet</h2>
          <p className="text-muted-foreground text-sm mb-4">
            When someone likes your profile, they will appear here. Keep swiping to get noticed!
          </p>
          <Link href="/feed">
            <Button data-testid="button-go-discover">Go Discover</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="grid-likes">
          {likers.map((profile) => {
            const avatarUrl =
              profile.photoUrl ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`;

            return (
              <Link key={profile.id} href="/feed" data-testid={`link-liker-${profile.id}`}>
                <Card
                  className="overflow-visible hover-elevate cursor-pointer"
                  data-testid={`card-liker-${profile.id}`}
                >
                  <div className="relative aspect-[3/4] overflow-hidden rounded-t-md">
                    <img
                      src={avatarUrl}
                      alt={profile.displayName}
                      className="w-full h-full object-cover"
                      data-testid={`img-liker-${profile.id}`}
                    />
                    {profile.isVerified && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="default" className="text-xs" data-testid={`badge-verified-${profile.id}`}>
                          Verified
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold truncate" data-testid={`text-liker-name-${profile.id}`}>
                      {profile.displayName}, {profile.age}
                    </h3>
                    {profile.bio && (
                      <p className="text-xs text-muted-foreground truncate mt-1" data-testid={`text-liker-bio-${profile.id}`}>
                        {profile.bio}
                      </p>
                    )}
                    {profile.locationName && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`text-liker-location-${profile.id}`}>
                        {profile.locationName}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
