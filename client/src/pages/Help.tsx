import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, HelpCircle, MessageSquare, Shield, CreditCard, Heart, Users, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface ContactForm {
  subject: string;
  category: string;
  message: string;
}

const faqs = [
  {
    category: "Account",
    icon: Users,
    questions: [
      {
        q: "How do I verify my profile?",
        a: "Go to Edit Profile and tap on 'Get Verified'. You'll be asked to take a selfie matching a specific pose to verify your identity. Once approved, you'll receive a verified badge."
      },
      {
        q: "How do I delete my account?",
        a: "To delete your account, please contact our support team using the form below. We'll process your request within 48 hours."
      },
      {
        q: "Can I change my display name?",
        a: "Yes! Go to Edit Profile from the menu and update your display name. Changes will be visible to other users immediately."
      }
    ]
  },
  {
    category: "Matching",
    icon: Heart,
    questions: [
      {
        q: "How does matching work?",
        a: "When you like someone and they like you back, it's a match! You'll both be notified and can start messaging each other."
      },
      {
        q: "What are AI Matches?",
        a: "AI Matches use artificial intelligence to analyze profiles and suggest compatible matches based on your interests, bio, and preferences."
      },
      {
        q: "Can I unmatch someone?",
        a: "Currently, matches are permanent. If you're having issues with a match, please report them using the contact form below."
      }
    ]
  },
  {
    category: "Premium",
    icon: CreditCard,
    questions: [
      {
        q: "What are the premium membership tiers?",
        a: "We offer three tiers: Basic ($4.99/mo) with daily super likes and ad-free experience, Pro ($9.99/mo) with unlimited super likes and priority matching, and Elite ($19.99/mo) with all features plus profile boost and VIP badge."
      },
      {
        q: "How do I cancel my subscription?",
        a: "Go to Premium from the menu and click 'Manage Subscription'. This will take you to the customer portal where you can cancel or modify your subscription."
      },
      {
        q: "Do I get a free trial?",
        a: "Yes! New users get a 30-day free trial to message matches. After the trial, you'll need a premium subscription to continue messaging."
      }
    ]
  },
  {
    category: "Safety",
    icon: Shield,
    questions: [
      {
        q: "How do I report a user?",
        a: "Use the contact form below to report any concerning behavior. Include the user's display name and describe the issue. Our team will investigate within 24 hours."
      },
      {
        q: "Is my data secure?",
        a: "Yes, we use industry-standard encryption to protect your data. We never share your personal information with third parties without consent."
      },
      {
        q: "How do I block someone?",
        a: "Currently, you can swipe left (pass) on profiles you're not interested in. To block a match, please contact support with details."
      }
    ]
  }
];

export default function Help() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ContactForm>({
    defaultValues: {
      subject: "",
      category: "",
      message: "",
    },
  });

  const onSubmit = async (data: ContactForm) => {
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Support request:", data);
    toast({
      title: "Message Sent",
      description: "Our support team will get back to you within 24-48 hours.",
    });
    form.reset();
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
      <div className="max-w-2xl mx-auto p-4">
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => setLocation("/feed")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold">Help & Support</h1>
          <p className="text-muted-foreground mt-2">Find answers or contact our support team</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Frequently Asked Questions
            </CardTitle>
            <CardDescription>Quick answers to common questions</CardDescription>
          </CardHeader>
          <CardContent>
            {faqs.map((category) => (
              <div key={category.category} className="mb-6 last:mb-0">
                <h3 className="font-semibold flex items-center gap-2 mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                  <category.icon className="w-4 h-4" />
                  {category.category}
                </h3>
                <Accordion type="single" collapsible className="w-full">
                  {category.questions.map((faq, index) => (
                    <AccordionItem key={index} value={`${category.category}-${index}`}>
                      <AccordionTrigger className="text-left" data-testid={`faq-${category.category.toLowerCase()}-${index}`}>
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Contact Support
            </CardTitle>
            <CardDescription>Can't find what you're looking for? Send us a message</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="category"
                  rules={{ required: "Please select a category" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl" data-testid="select-category">
                            <SelectValue placeholder="What's this about?" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="account">Account Issue</SelectItem>
                          <SelectItem value="matching">Matching & Messages</SelectItem>
                          <SelectItem value="premium">Premium & Billing</SelectItem>
                          <SelectItem value="safety">Safety & Report User</SelectItem>
                          <SelectItem value="bug">Bug Report</SelectItem>
                          <SelectItem value="feedback">Feature Feedback</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject"
                  rules={{ required: "Please enter a subject" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Brief description of your issue" 
                          className="h-12 rounded-xl"
                          data-testid="input-subject"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  rules={{ required: "Please enter a message" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe your issue in detail..."
                          className="min-h-[120px] rounded-xl resize-none"
                          data-testid="input-message"
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
                  disabled={isSubmitting}
                  data-testid="button-submit"
                >
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Our support team typically responds within 24-48 hours.
        </p>
      </div>
    </div>
  );
}
