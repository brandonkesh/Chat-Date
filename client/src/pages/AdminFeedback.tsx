import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMyProfile } from "@/hooks/use-dating";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Inbox, ArrowLeft, Loader2, MessageSquare, Bug, Lightbulb, ShieldAlert, CheckCircle2, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

type FeedbackItem = {
  id: number;
  userId: string;
  category: string;
  message: string;
  status: string;
  createdAt: string | null;
  submitterEmail: string | null;
  submitterName: string | null;
};

function categoryMeta(category: string) {
  switch (category) {
    case "bug":
      return { label: "Bug", icon: <Bug className="w-3 h-3 mr-1" />, variant: "destructive" as const };
    case "suggestion":
      return { label: "Suggestion", icon: <Lightbulb className="w-3 h-3 mr-1" />, variant: "default" as const };
    default:
      return { label: "Other", icon: <MessageSquare className="w-3 h-3 mr-1" />, variant: "secondary" as const };
  }
}

export default function AdminFeedback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const isOwner = (profile as any)?.isOwner === true;
  const [showResolved, setShowResolved] = useState(false);

  const { data: items, isLoading, isError } = useQuery<FeedbackItem[]>({
    queryKey: [api.feedback.list.path],
    enabled: isOwner,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "new" | "resolved" }) => {
      const url = buildUrl(api.feedback.updateStatus.path, { id });
      return apiRequest("PATCH", url, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.feedback.list.path] });
    },
    onError: () => {
      toast({
        title: "Couldn't update feedback",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const visibleItems = (items ?? []).filter((item) =>
    showResolved ? true : item.status !== "resolved"
  );
  const resolvedCount = (items ?? []).filter((item) => item.status === "resolved").length;

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-secondary/30 p-4 pb-24">
        <div className="max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/feed")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Card className="border-none shadow-lg">
            <CardHeader className="text-center pb-6 pt-8">
              <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <ShieldAlert className="w-7 h-7 text-destructive" />
              </div>
              <CardTitle className="text-xl" data-testid="text-access-denied">Access Denied</CardTitle>
              <CardDescription>You don't have permission to view this page.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/feed")}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Inbox className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="text-admin-feedback-title">User Feedback</h1>
              <p className="text-sm text-muted-foreground">All submissions, newest first.</p>
            </div>
          </div>
          <Button
            variant={showResolved ? "default" : "outline"}
            size="sm"
            onClick={() => setShowResolved((prev) => !prev)}
            data-testid="button-toggle-resolved"
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
            {resolvedCount > 0 ? ` (${resolvedCount})` : ""}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <Card className="border-none shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-feedback-error">
              Failed to load feedback. Please try again.
            </CardContent>
          </Card>
        ) : !items || items.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="py-16 text-center" data-testid="text-feedback-empty">
              <MessageSquare className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">No feedback yet.</p>
            </CardContent>
          </Card>
        ) : visibleItems.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="py-16 text-center" data-testid="text-feedback-all-resolved">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">All caught up! No new feedback to triage.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleItems.map((item) => {
              const meta = categoryMeta(item.category);
              const isResolved = item.status === "resolved";
              const isUpdating =
                updateStatus.isPending && updateStatus.variables?.id === item.id;
              return (
                <Card
                  key={item.id}
                  className={`border-none shadow-sm ${isResolved ? "opacity-70" : ""}`}
                  data-testid={`card-feedback-${item.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={meta.variant} data-testid={`badge-category-${item.id}`}>
                          {meta.icon}
                          {meta.label}
                        </Badge>
                        {isResolved && (
                          <Badge variant="outline" className="text-green-600 border-green-600/40" data-testid={`badge-status-${item.id}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid={`text-date-${item.id}`}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap mb-3" data-testid={`text-message-${item.id}`}>
                      {item.message}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground" data-testid={`text-submitter-${item.id}`}>
                        From: {item.submitterName || item.submitterEmail || item.userId}
                        {item.submitterName && item.submitterEmail ? ` (${item.submitterEmail})` : ""}
                      </p>
                      <Button
                        variant={isResolved ? "ghost" : "outline"}
                        size="sm"
                        disabled={isUpdating}
                        onClick={() =>
                          updateStatus.mutate({
                            id: item.id,
                            status: isResolved ? "new" : "resolved",
                          })
                        }
                        data-testid={`button-${isResolved ? "reopen" : "resolve"}-${item.id}`}
                      >
                        {isUpdating ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : isResolved ? (
                          <RotateCcw className="w-3 h-3 mr-1" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                        )}
                        {isResolved ? "Reopen" : "Mark resolved"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
