import { useSavedProfiles, useSaveProfile } from "@/hooks/use-dating";
import { Loader2, Bookmark, ArrowLeft, Heart } from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SavedProfiles() {
  const { data: saved, isLoading } = useSavedProfiles();
  const { mutate: saveProfile } = useSaveProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 md:pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back-saved">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Bookmark className="w-6 h-6 text-primary fill-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-saved-title">Saved Profiles</h1>
        </div>
        {saved && saved.length > 0 && (
          <Badge variant="secondary" data-testid="badge-saved-count">
            {saved.length}
          </Badge>
        )}
      </div>

      {!saved || saved.length === 0 ? (
        <Card className="p-8 text-center">
          <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2" data-testid="text-no-saved">No saved profiles</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Save profiles you're interested in to view them later.
          </p>
          <Link href="/feed">
            <Button data-testid="button-go-discover-saved">Go Discover</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="grid-saved">
          {saved.map((profile: any) => {
            const avatarUrl =
              profile.photoUrl ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`;

            return (
              <Card
                key={profile.id}
                className="overflow-visible hover-elevate"
                data-testid={`card-saved-${profile.id}`}
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-t-md">
                  <img
                    src={avatarUrl}
                    alt={profile.displayName}
                    className="w-full h-full object-cover"
                    data-testid={`img-saved-${profile.id}`}
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2 w-8 h-8"
                    onClick={() => saveProfile({ userId: profile.userId, save: false })}
                    data-testid={`button-unsave-${profile.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold truncate" data-testid={`text-saved-name-${profile.id}`}>
                    {profile.displayName}, {profile.age}
                  </h3>
                  <Link href="/feed">
                    <Button variant="link" className="p-0 h-auto text-xs" data-testid={`link-view-${profile.id}`}>
                      View Profile
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
