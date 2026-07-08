import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DateCheckin as DateCheckinType, insertDateCheckinSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { z } from "zod";
import { Loader2, Shield, CheckCircle2, Trash2, MapPin, CalendarClock, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  dateName: z.string().min(1, "Who are you meeting?"),
  location: z.string().min(1, "Where are you meeting?"),
  dateTime: z.string().min(1, "When is the date?"),
  friendEmail: z.string().email("Enter a valid email for your trusted friend"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function DateCheckin() {
  const { toast } = useToast();

  const { data: checkins, isLoading } = useQuery<DateCheckinType[]>({
    queryKey: ["/api/date-checkins"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dateName: "",
      location: "",
      dateTime: "",
      friendEmail: "",
      notes: "",
    },
  });

  const { mutate: createCheckin, isPending: creating } = useMutation({
    mutationFn: async (values: FormValues) => {
      await apiRequest("POST", "/api/date-checkins", {
        ...values,
        dateTime: new Date(values.dateTime).toISOString(),
        notes: values.notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/date-checkins"] });
      form.reset();
      toast({
        title: "Date plan shared! 🛡️",
        description: "We emailed your trusted friend with the details.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Couldn't save your date plan. Please try again.", variant: "destructive" });
    },
  });

  const { mutate: markSafe, isPending: markingSafe } = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/date-checkins/${id}/safe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/date-checkins"] });
      toast({ title: "Glad you're safe! 💙", description: "Check-in marked as safe." });
    },
  });

  const { mutate: removeCheckin } = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/date-checkins/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/date-checkins"] });
      toast({ title: "Deleted", description: "Date plan removed." });
    },
  });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 pb-24" data-testid="page-date-checkin">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-3xl font-display font-bold">Date Check-In</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Meeting someone for the first time? Share your plans with a trusted friend — we'll email them the details. After your date, tap "I'm safe" to let them relax.
      </p>

      <Card className="p-4 md:p-6 mb-8">
        <h2 className="font-bold text-lg mb-4">Share a new date plan</h2>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createCheckin(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="dateName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Who are you meeting?</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Alex from Crush" {...field} data-testid="input-date-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Where?</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Blue Bottle Coffee, Main St" {...field} data-testid="input-location" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>When?</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} data-testid="input-date-time" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="friendEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trusted friend's email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="friend@example.com" {...field} data-testid="input-friend-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Anything else your friend should know" {...field} data-testid="input-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full gap-2" disabled={creating} data-testid="button-share-date-plan">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Share date plan
            </Button>
          </form>
        </Form>
      </Card>

      <h2 className="font-bold text-lg mb-3">Your date plans</h2>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : !checkins || checkins.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground" data-testid="text-empty-checkins">
          No date plans yet. Share one above before your next date!
        </Card>
      ) : (
        <div className="space-y-3">
          {checkins.map((c) => (
            <Card key={c.id} className="p-4" data-testid={`card-checkin-${c.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold truncate" data-testid={`text-checkin-name-${c.id}`}>{c.dateName}</p>
                    {c.checkedIn ? (
                      <Badge className="bg-green-500 text-white border-none text-[10px]">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" />
                        Safe
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Upcoming</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.location}</span>
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                    {new Date(c.dateTime).toLocaleString(undefined, {
                      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.friendEmail}</span>
                  </p>
                  {c.notes && <p className="text-sm text-muted-foreground mt-1">{c.notes}</p>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {!c.checkedIn && (
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-600 text-white gap-1"
                      disabled={markingSafe}
                      onClick={() => markSafe(c.id)}
                      data-testid={`button-safe-${c.id}`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      I'm safe
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => removeCheckin(c.id)}
                    data-testid={`button-delete-checkin-${c.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
