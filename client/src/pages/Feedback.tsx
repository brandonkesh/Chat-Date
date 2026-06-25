import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { insertFeedbackSchema, type InsertFeedback } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquarePlus, ArrowLeft, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Feedback() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const form = useForm<InsertFeedback>({
    resolver: zodResolver(insertFeedbackSchema),
    defaultValues: {
      category: "suggestion",
      message: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: InsertFeedback) => {
      const res = await apiRequest("POST", api.feedback.create.path, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Feedback sent",
        description: "Thanks for helping us improve Crush!",
      });
      form.reset({ category: "suggestion", message: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't send feedback",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertFeedback) => {
    submitMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-secondary/30 p-4 pb-24">
      <div className="max-w-lg mx-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/preferences")}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <Card className="border-none shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <MessageSquarePlus className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl" data-testid="text-feedback-title">
              Send Feedback
            </CardTitle>
            <CardDescription>
              Found a bug or have an idea? Let us know — we read every message.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-feedback-category">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="bug" data-testid="option-category-bug">Bug</SelectItem>
                          <SelectItem value="suggestion" data-testid="option-category-suggestion">Suggestion</SelectItem>
                          <SelectItem value="other" data-testid="option-category-other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us what's on your mind..."
                          className="min-h-[140px] resize-none"
                          data-testid="input-feedback-message"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-feedback"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Feedback
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
