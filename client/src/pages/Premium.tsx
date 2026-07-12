import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Heart,
  Sparkles,
  Video,
  Shield,
  Eye,
  Filter,
  Bell,
  Bookmark,
  UserCheck,
  Rocket,
  Lock,
  Gift,
  Gem,
} from "lucide-react";

const allFeatures = [
  { text: "Unlimited likes & super likes", icon: Heart },
  { text: "See everyone who likes you", icon: Eye },
  { text: "Priority matching algorithm", icon: Rocket },
  { text: "Advanced filters (age, distance, lifestyle)", icon: Filter },
  { text: "Read receipts on messages", icon: Bell },
  { text: "Voice & video calls", icon: Video },
  { text: "AI chat advisor", icon: Sparkles },
  { text: "AI photo match", icon: Sparkles },
  { text: "AI profile optimizer", icon: Sparkles },
  { text: "Weekly profile boost", icon: Rocket },
  { text: "Incognito mode — browse privately", icon: Lock },
  { text: "VIP badge on your profile", icon: UserCheck },
  { text: "Save profiles for later", icon: Bookmark },
  { text: "Ad-free experience", icon: Shield },
  { text: "Unlimited message history", icon: Check },
  { text: "Priority customer support", icon: Shield },
  { text: "Exclusive member events", icon: Gift },
];

export default function Premium() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24 md:pb-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-orange-500 mb-4">
          <Gem className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold mb-2" data-testid="text-premium-title">
          Everything's included — free!
        </h1>
        <p className="text-muted-foreground" data-testid="text-premium-subtitle">
          Every member gets the full Crush experience. No plans, no payments, no
          limits — it's all yours.
        </p>
        <Badge
          className="mt-4 bg-gradient-to-r from-blue-600 to-orange-500 text-white border-0"
          data-testid="badge-free-forever"
        >
          All features unlocked
        </Badge>
      </div>

      <Card data-testid="card-all-features">
        <CardContent className="pt-6">
          <ul className="space-y-3">
            {allFeatures.map((feature, i) => (
              <li
                key={i}
                className="flex items-center gap-3"
                data-testid={`feature-item-${i}`}
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950 shrink-0">
                  <feature.icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </span>
                <span className="text-sm">{feature.text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p
        className="text-center text-sm text-muted-foreground mt-6"
        data-testid="text-premium-footer"
      >
        Enjoy Crush — on the house. 💙
      </p>
    </div>
  );
}
