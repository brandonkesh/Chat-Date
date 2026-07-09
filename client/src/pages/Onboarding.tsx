import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProfileSchema, type InsertProfile } from "@shared/schema";
import { useUpdateProfile } from "@/hooks/use-dating";
import { useLocation } from "wouter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, X, Plus, ShieldCheck, AlertCircle, Crown, Gem, Sparkles, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { differenceInYears, parse, isValid } from "date-fns";
import type { MembershipTier } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

const PLAN_OPTIONS: {
  id: MembershipTier;
  name: string;
  price: string;
  tagline: string;
  icon: typeof Heart;
  popular?: boolean;
}[] = [
  { id: "free", name: "Free", price: "$0", tagline: "Browse & match for free", icon: Heart },
  { id: "basic", name: "Basic", price: "$4.99/mo", tagline: "More likes & see who viewed you", icon: Sparkles },
  { id: "pro", name: "Pro", price: "$9.99/mo", tagline: "Unlimited likes & video calls", icon: Crown, popular: true },
  { id: "elite", name: "Elite", price: "$19.99/mo", tagline: "Everything + top visibility", icon: Gem },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { mutateAsync: createProfile, isPending } = useUpdateProfile();
  const [newInterest, setNewInterest] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<MembershipTier>("free");

  const [dobError, setDobError] = useState("");

  const form = useForm<InsertProfile>({
    resolver: zodResolver(insertProfileSchema),
    defaultValues: {
      displayName: "",
      bio: "",
      age: 18,
      dateOfBirth: "",
      gender: "male",
      interestedIn: "female",
      photoUrl: "",
      interests: [],
    },
  });

  const interests = form.watch("interests") || [];

  const addInterest = () => {
    const trimmed = newInterest.trim();
    if (trimmed && !interests.includes(trimmed)) {
      form.setValue("interests", [...interests, trimmed]);
      setNewInterest("");
    }
  };

  const removeInterest = (interest: string) => {
    form.setValue("interests", interests.filter(i => i !== interest));
  };

  const handleInterestKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addInterest();
    }
  };

  const onSubmit = async (data: InsertProfile) => {
    if (!data.dateOfBirth) {
      setDobError("Please enter your date of birth.");
      return;
    }
    const dob = new Date(data.dateOfBirth);
    const age = differenceInYears(new Date(), dob);
    if (age < 18) {
      setDobError("You must be at least 18 years old.");
      return;
    }
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await createProfile({ ...data, age, timezone });
      if (selectedPlan !== "free") {
        await apiRequest("POST", "/api/select-plan", { tier: selectedPlan });
        queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      }
      setLocation("/feed");
    } catch (error) {
      // Error handled by hook toast
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-none shadow-xl">
        <CardHeader className="text-center pb-8 pt-8">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
            <Heart className="fill-current w-6 h-6" />
          </div>
          <CardTitle className="text-3xl font-display">Create Profile</CardTitle>
          <CardDescription>Tell us about yourself to start matching</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" className="h-12 rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      Date of Birth
                      <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="h-12 rounded-xl"
                        data-testid="input-date-of-birth"
                        max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          setDobError("");
                          if (e.target.value) {
                            const dob = new Date(e.target.value);
                            const age = differenceInYears(new Date(), dob);
                            if (age < 18) {
                              setDobError("You must be at least 18 years old.");
                            } else {
                              form.setValue("age", age);
                            }
                          }
                        }}
                      />
                    </FormControl>
                    {dobError && (
                      <p className="text-sm text-destructive flex items-center gap-1" data-testid="text-dob-error">
                        <AlertCircle className="w-3 h-3" />
                        {dobError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Your age will be calculated and verified from your date of birth.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="interestedIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interested In</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Men</SelectItem>
                          <SelectItem value="female">Women</SelectItem>
                          <SelectItem value="nonbinary">Non-binary</SelectItem>
                          <SelectItem value="everyone">Everyone</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="What makes you unique?" 
                        className="min-h-[100px] rounded-xl resize-none" 
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Hobbies & Interests</FormLabel>
                <div className="flex gap-2">
                  <Input
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onKeyDown={handleInterestKeyDown}
                    placeholder="Add an interest..."
                    className="h-12 rounded-xl flex-1"
                    data-testid="input-interest"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addInterest}
                    className="h-12 w-12 rounded-xl"
                    data-testid="button-add-interest"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {interests.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3" data-testid="interests-list">
                    {interests.map((interest) => (
                      <Badge 
                        key={interest} 
                        variant="secondary" 
                        className="px-3 py-1 text-sm"
                      >
                        {interest}
                        <button
                          type="button"
                          onClick={() => removeInterest(interest)}
                          className="ml-2 hover:text-destructive"
                          data-testid={`button-remove-interest-${interest}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </FormItem>

              <FormItem>
                <FormLabel>Choose your plan</FormLabel>
                <p className="text-xs text-muted-foreground -mt-1 mb-1">
                  Pick what works for you — every plan is free right now, no payment needed. You can change it anytime.
                </p>
                <div className="grid grid-cols-2 gap-3" data-testid="plan-options">
                  {PLAN_OPTIONS.map((plan) => {
                    const PlanIcon = plan.icon;
                    const isSelected = selectedPlan === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlan(plan.id)}
                        className={`relative text-left rounded-xl border p-3 transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary"
                            : "border-border hover-elevate"
                        }`}
                        data-testid={`button-plan-${plan.id}`}
                      >
                        {plan.popular && (
                          <Badge className="absolute -top-2 right-2 bg-primary text-[10px] px-1.5 py-0">
                            Popular
                          </Badge>
                        )}
                        <div className="flex items-center gap-2">
                          <PlanIcon className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-sm">{plan.name}</span>
                          {isSelected && <Check className="w-4 h-4 text-primary ml-auto" />}
                        </div>
                        <div className="text-sm font-bold mt-1">{plan.price}</div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                          {plan.tagline}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </FormItem>

              <Button 
                type="submit" 
                className="w-full h-12 text-lg rounded-full font-semibold shadow-lg shadow-primary/20"
                disabled={isPending}
              >
                {isPending ? "Creating..." : "Start Matching"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
