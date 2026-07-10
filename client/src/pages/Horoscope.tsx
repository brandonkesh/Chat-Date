import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, MoonStar, Pencil } from "lucide-react";
import { Link } from "wouter";

const SIGN_EMOJI: Record<string, string> = {
  aries: "♈", taurus: "♉", gemini: "♊", cancer: "♋",
  leo: "♌", virgo: "♍", libra: "♎", scorpio: "♏",
  sagittarius: "♐", capricorn: "♑", aquarius: "♒", pisces: "♓",
};

type HoroscopeResponse =
  | { needsSign: true }
  | { sign: string; dayKey: string; content: string };

export default function Horoscope() {
  const { data, isLoading, isError } = useQuery<HoroscopeResponse>({
    queryKey: ["/api/horoscope"],
  });

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-horoscope">
      <div className="flex items-center gap-3">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold" data-testid="heading-horoscope">Love Horoscope</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-3xl">🌫️</p>
            <p className="text-sm text-muted-foreground">
              The stars are cloudy right now. Please try again in a bit!
            </p>
          </CardContent>
        </Card>
      ) : data && "needsSign" in data ? (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <MoonStar className="w-12 h-12 text-primary mx-auto" />
            <h2 className="font-display text-lg font-bold">What's your sign? ✨</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Add your astrological sign to your profile and we'll write you a fresh
              dating horoscope every day.
            </p>
            <Link href="/profile/edit">
              <Button data-testid="button-set-sign">
                <Pencil className="w-4 h-4 mr-2" />
                Set my sign
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-8 text-center text-white">
            <div className="text-6xl mb-3" data-testid="text-sign-emoji">
              {SIGN_EMOJI[data.sign] || "🌟"}
            </div>
            <h2 className="font-display text-2xl font-bold capitalize" data-testid="text-sign-name">
              {data.sign}
            </h2>
            <p className="text-xs text-white/70 mt-1">Today's love energy</p>
          </div>
          <CardContent className="p-6">
            <p className="text-base leading-relaxed text-center" data-testid="text-horoscope">
              {data.content}
            </p>
            <p className="text-[11px] text-muted-foreground text-center mt-4">
              ✨ A new horoscope arrives every day — for fun, not fate!
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
