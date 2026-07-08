import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PartyPopper, RefreshCw, Grid3x3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "crush-date-bingo";
const FREE_SQUARE = "FREE ⭐";

const PROMPT_POOL: string[] = [
  "Awkward hug hello",
  "You both order the same drink",
  "They show you a pet photo",
  "Nervous laughter",
  "Talked 10 min past closing",
  "You arrive early",
  "They're running late",
  "Split the bill debate",
  "Talk about your exes (oops)",
  "Same taste in music",
  "One of you spills a drink",
  "Phone dies mid-date",
  "They compliment your outfit",
  "Awkward silence moment",
  "You find a mutual friend",
  "Talk about traveling",
  "They laugh at your joke",
  "Order dessert to share",
  "Bump knees under the table",
  "Debate a favorite show",
  "You lose track of time",
  "Talk about your jobs",
  "They ask a deep question",
  "Accidental hand touch",
  "Take a cute selfie together",
  "Make plans for date #2",
  "They walk you to your car",
  "You both get nervous",
  "Discover a shared hobby",
  "Someone quotes a meme",
  "Talk about star signs",
  "You over-explain something",
];

interface BingoState {
  card: string[];
  marked: boolean[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCard(): BingoState {
  const picks = shuffle(PROMPT_POOL).slice(0, 24);
  const card: string[] = [];
  const marked: boolean[] = [];
  for (let i = 0; i < 25; i++) {
    if (i === 12) {
      card.push(FREE_SQUARE);
      marked.push(true);
    } else {
      card.push(picks.pop() as string);
      marked.push(false);
    }
  }
  return { card, marked };
}

const WINNING_LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

function hasBingo(marked: boolean[]): boolean {
  return WINNING_LINES.some((line) => line.every((i) => marked[i]));
}

function loadState(): BingoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BingoState;
      if (Array.isArray(parsed.card) && parsed.card.length === 25 && Array.isArray(parsed.marked) && parsed.marked.length === 25) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return generateCard();
}

export default function DateBingo() {
  const { toast } = useToast();
  const [state, setState] = useState<BingoState>(() => loadState());
  const [bingo, setBingo] = useState<boolean>(() => hasBingo(loadState().marked));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const checkBingo = useCallback(
    (marked: boolean[]) => {
      const won = hasBingo(marked);
      setBingo((prev) => {
        if (won && !prev) {
          toast({ title: "BINGO! 🎉", description: "You got a line! Hope the date's going great 💕" });
        }
        return won;
      });
    },
    [toast]
  );

  const toggleSquare = (index: number) => {
    if (index === 12) return;
    setState((prev) => {
      const marked = [...prev.marked];
      marked[index] = !marked[index];
      checkBingo(marked);
      return { ...prev, marked };
    });
  };

  const newCard = () => {
    const next = generateCard();
    setState(next);
    setBingo(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 pb-24 md:pt-20" data-testid="page-date-bingo">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-rose-600 flex items-center justify-center">
          <Grid3x3 className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-3xl font-display font-bold">First Date Bingo</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Bring this along on your next first date! Tap a square when it happens. Get 5 in a row for a BINGO 🎉
      </p>

      {bingo && (
        <Card className="p-4 mb-4 bg-gradient-to-r from-pink-500 to-rose-600 text-white border-none" data-testid="banner-bingo">
          <div className="flex items-center gap-3">
            <PartyPopper className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold text-lg">BINGO! 🎉</p>
              <p className="text-sm text-white/90">You completed a line. Sounds like a fun date!</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-3 md:p-4 mb-6">
        <div className="grid grid-cols-5 gap-2">
          {state.card.map((text, i) => {
            const isMarked = state.marked[i];
            const isFree = i === 12;
            return (
              <button
                key={i}
                onClick={() => toggleSquare(i)}
                disabled={isFree}
                className={`aspect-square rounded-md p-1 text-[9px] md:text-xs font-medium leading-tight flex items-center justify-center text-center transition-colors ${
                  isMarked
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover-elevate active-elevate-2"
                }`}
                data-testid={`square-bingo-${i}`}
              >
                {text}
              </button>
            );
          })}
        </div>
      </Card>

      <Button variant="outline" className="w-full gap-2" onClick={newCard} data-testid="button-new-card">
        <RefreshCw className="w-4 h-4" />
        New Card
      </Button>
    </div>
  );
}
