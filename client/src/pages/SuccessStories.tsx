import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SuccessStory, insertSuccessStorySchema, type InsertSuccessStory } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Heart, PlusCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function SuccessStories() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: stories, isLoading } = useQuery<SuccessStory[]>({
    queryKey: ["/api/success-stories"],
  });

  const form = useForm<InsertSuccessStory>({
    resolver: zodResolver(insertSuccessStorySchema),
    defaultValues: {
      coupleNames: "",
      story: "",
    },
  });

  const { mutate: shareStory, isPending } = useMutation({
    mutationFn: async (values: InsertSuccessStory) => {
      await apiRequest("POST", "/api/success-stories", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/success-stories"] });
      form.reset();
      setOpen(false);
      toast({ title: "Story shared! 💕", description: "Thanks for spreading the love — congrats to you both!" });
    },
    onError: (error: Error) => {
      let description = "Something went wrong. Please try again.";
      const raw = error.message || "";
      const jsonStart = raw.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.message) description = parsed.message;
        } catch {
          description = raw.replace(/^\d+:\s*/, "") || description;
        }
      } else if (raw) {
        description = raw.replace(/^\d+:\s*/, "");
      }
      toast({ title: "Couldn't share your story", description, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 pb-24" data-testid="page-success-stories">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold">Success Stories</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-open-share-story">
              <PlusCircle className="w-4 h-4" />
              Share your story
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-share-story">
            <DialogHeader>
              <DialogTitle>Share your story 💕</DialogTitle>
              <DialogDescription>
                Found love on Crush? Inspire others by sharing how it happened!
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => shareStory(v))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="coupleNames"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Couple names</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Sarah & Mike" {...field} data-testid="input-couple-names" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="story"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your story</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us how you met and fell for each other…"
                          className="min-h-[140px] resize-none"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-story"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full gap-2" disabled={isPending} data-testid="button-submit-story">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
                  Share story
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-muted-foreground mb-6">
        Real couples, real love. Here's to all the connections that started right here on Crush 💞
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : !stories || stories.length === 0 ? (
        <Card className="p-8 text-center" data-testid="text-empty-stories">
          <div className="text-4xl mb-3">💕</div>
          <h2 className="font-bold text-lg mb-1">No stories yet</h2>
          <p className="text-muted-foreground mb-4">
            Be the first to share your love story and inspire others to find their crush!
          </p>
          <Button className="gap-2" onClick={() => setOpen(true)} data-testid="button-empty-share-story">
            <PlusCircle className="w-4 h-4" />
            Share your story
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {stories.map((s) => (
            <Card key={s.id} className="p-4 md:p-5" data-testid={`card-story-${s.id}`}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="font-bold text-lg flex items-center gap-2" data-testid={`text-couple-names-${s.id}`}>
                  <span>💕</span>
                  {s.coupleNames}
                </h3>
                {s.createdAt && (
                  <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-story-date-${s.id}`}>
                    {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid={`text-story-${s.id}`}>
                {s.story}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
