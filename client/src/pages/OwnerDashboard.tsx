import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Users, Heart, MessageCircle, TrendingUp, BarChart3, Inbox } from "lucide-react";
import { Link } from "wouter";
import { useMyProfile } from "@/hooks/use-dating";

type AdminStats = {
  totalMembers: number;
  newMembersThisWeek: number;
  totalMatches: number;
  matchesThisWeek: number;
  totalMessages: number;
  messagesThisWeek: number;
};

function StatCard({
  icon,
  label,
  value,
  sub,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-3xl font-display font-bold" data-testid={`${testId}-value`}>
          {value.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-green-500" />
          {sub}
        </p>
      </CardContent>
    </Card>
  );
}

export default function OwnerDashboard() {
  const { data: profile } = useMyProfile();
  const isOwner = (profile as any)?.isOwner === true;

  const { data: stats, isLoading, isError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: isOwner,
  });

  if (profile && !isOwner) {
    return (
      <div className="max-w-lg mx-auto p-6 pt-24 text-center space-y-3" data-testid="page-owner-dashboard">
        <p className="text-3xl">🔒</p>
        <p className="text-sm text-muted-foreground">This page is for the app owner only.</p>
        <Link href="/feed">
          <Button variant="outline">Back to the app</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-owner-dashboard">
      <div className="flex items-center gap-3">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold" data-testid="heading-owner-dashboard">Owner Dashboard</h1>
          <p className="text-sm text-muted-foreground">How Crush is doing at a glance 📊</p>
        </div>
      </div>

      {isLoading || !profile ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Couldn't load stats. Please refresh the page.
          </CardContent>
        </Card>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Members"
              value={stats.totalMembers}
              sub={`+${stats.newMembersThisWeek} new this week`}
              testId="stat-members"
            />
            <StatCard
              icon={<Heart className="w-4 h-4" />}
              label="Matches"
              value={stats.totalMatches}
              sub={`+${stats.matchesThisWeek} this week`}
              testId="stat-matches"
            />
            <StatCard
              icon={<MessageCircle className="w-4 h-4" />}
              label="Messages"
              value={stats.totalMessages}
              sub={`+${stats.messagesThisWeek} this week`}
              testId="stat-messages"
            />
            <Card data-testid="stat-activity">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Weekly pulse</span>
                </div>
                <p className="text-sm leading-relaxed">
                  {stats.messagesThisWeek > 0
                    ? `Your community sent ${stats.messagesThisWeek.toLocaleString()} messages and made ${stats.matchesThisWeek} matches this week! 🎉`
                    : "Things are quiet this week — a good time to spread the word! 📣"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Link href="/admin/feedback" className="block">
            <Card className="hover-elevate">
              <CardContent className="p-4 flex items-center gap-3">
                <Inbox className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Member Feedback</p>
                  <p className="text-xs text-muted-foreground">See what members are saying</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </>
      ) : null}
    </div>
  );
}
