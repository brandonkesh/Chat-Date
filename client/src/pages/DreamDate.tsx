import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Wand2, Heart } from "lucide-react";
import { Link } from "wouter";
import { useMyProfile, useUpdateProfile, useMatches } from "@/hooks/use-dating";
import { useToast } from "@/hooks/use-toast";

const DREAM_ELEMENTS: { id: string; emoji: string; label: string }[] = [
  { id: "dinner", emoji: "🍝", label: "Fancy dinner" },
  { id: "coffee", emoji: "☕", label: "Coffee date" },
  { id: "hike", emoji: "🥾", label: "Scenic hike" },
  { id: "movie", emoji: "🎬", label: "Movie night" },
  { id: "beach", emoji: "🏖️", label: "Beach walk" },
  { id: "art", emoji: "🎨", label: "Art gallery" },
  { id: "live-music", emoji: "🎶", label: "Live music" },
  { id: "ice-cream", emoji: "🍦", label: "Ice cream stroll" },
  { id: "picnic", emoji: "🌅", label: "Sunset picnic" },
  { id: "bowling", emoji: "🎳", label: "Bowling" },
  { id: "wine", emoji: "🍷", label: "Wine tasting" },
  { id: "amusement-park", emoji: "🎡", label: "Amusement park" },
  { id: "street-food", emoji: "🌮", label: "Street food tour" },
  { id: "bookstore", emoji: "📚", label: "Bookstore browsing" },
  { id: "road-trip", emoji: "🚗", label: "Mini road trip" },
  { id: "stargazing", emoji: "✨", label: "Stargazing" },
];

const elementById = Object.fromEntries(DREAM_ELEMENTS.map((e) => [e.id, e]));
const MAX_ELEMENTS = 6;

export default function DreamDate() {
  const { data: profile, isLoading } = useMyProfile();
  const { data: matches } = useMatches();
  const { mutate: updateProfile, isPending } = useUpdateProfile();
  const { toast } = useToast();

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (profile) {
      setSelected(((profile as any).dreamDateElements as string[] | null) || []);
    }
  }, [profile]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_ELEMENTS) {
        toast({ title: `Max ${MAX_ELEMENTS} elements`, description: "Remove one to add another." });
        return prev;
      }
      return [...prev, id];
    });
  };

  const save = () => {
    if (!profile) return;
    updateProfile({
      displayName: profile.displayName,
      age: profile.age,
      gender: profile.gender,
      interestedIn: profile.interestedIn,
      bio: profile.bio,
      photoUrl: profile.photoUrl,
      interests: profile.interests,
      dreamDateElements: selected,
    } as any, {
      onSuccess: () => {
        toast({
          title: "Dream date saved! 💫",
          description: "We'll show you what you have in common with your matches.",
        });
      },
    });
  };

  const saved = ((profile as any)?.dreamDateElements as string[] | null) || [];
  const overlaps = (matches || [])
    .map(({ match, partnerProfile }) => {
      const theirs = ((partnerProfile as any).dreamDateElements as string[] | null) || [];
      const shared = saved.filter((e) => theirs.includes(e));
      return { matchId: match.id, name: partnerProfile.displayName, photoUrl: partnerProfile.photoUrl, shared };
    })
    .filter((o) => o.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-dream-date">
      <div className="flex items-center gap-3">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold" data-testid="heading-dream-date">Dream Date Builder</h1>
          <p className="text-sm text-muted-foreground">Build your perfect date — see who dreams like you 💭</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Pick your ingredients</CardTitle>
              <CardDescription>Choose up to {MAX_ELEMENTS} things that make your dream date</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {DREAM_ELEMENTS.map((el) => {
              const active = selected.includes(el.id);
              return (
                <button
                  key={el.id}
                  onClick={() => toggle(el.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left text-sm transition-colors ${
                    active
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border bg-secondary/40 hover:bg-secondary"
                  }`}
                  data-testid={`element-${el.id}`}
                >
                  <span className="text-xl">{el.emoji}</span>
                  <span className="min-w-0">{el.label}</span>
                </button>
              );
            })}
          </div>
          <Button
            className="w-full mt-4"
            onClick={save}
            disabled={isPending}
            data-testid="button-save-dream-date"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save my dream date
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
              <Heart className="w-4 h-4 text-accent" />
            </div>
            <div>
              <CardTitle className="text-lg">Dream date matches</CardTitle>
              <CardDescription>Matches who picked the same ingredients as you</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {saved.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Save your dream date first to see overlaps ✨
            </p>
          ) : overlaps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              None of your matches have overlapping picks yet. Check back soon!
            </p>
          ) : (
            overlaps.map((o) => (
              <Link key={o.matchId} href={`/chat/${o.matchId}`} className="block">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover-elevate" data-testid={`overlap-${o.matchId}`}>
                  <img
                    src={o.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${o.name}`}
                    alt={o.name}
                    className="w-10 h-10 rounded-full object-cover bg-secondary shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{o.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {o.shared.map((id) => `${elementById[id]?.emoji ?? ""} ${elementById[id]?.label ?? id}`).join(" · ")}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary shrink-0">
                    {o.shared.length} in common
                  </span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
