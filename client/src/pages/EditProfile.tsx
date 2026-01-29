import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProfileSchema, type InsertProfile, type Profile } from "@shared/schema";
import { useMyProfile, useUpdateProfile } from "@/hooks/use-dating";
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
import { ArrowLeft, Loader2, X, Plus, ShieldCheck, ChevronRight } from "lucide-react";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";

function EditProfileForm({ profile }: { profile: Profile }) {
  const [, setLocation] = useLocation();
  const { mutateAsync: updateProfile, isPending } = useUpdateProfile();
  const [newInterest, setNewInterest] = useState("");

  const form = useForm<InsertProfile>({
    resolver: zodResolver(insertProfileSchema),
    defaultValues: {
      displayName: profile.displayName,
      bio: profile.bio ?? "",
      age: profile.age,
      gender: profile.gender,
      interestedIn: profile.interestedIn,
      photoUrl: profile.photoUrl || "",
      interests: profile.interests || [],
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
    try {
      await updateProfile(data);
      setLocation("/feed");
    } catch (error) {
      // Error handled by hook toast
    }
  };

  const handlePhotoUploaded = (objectPath: string) => {
    form.setValue("photoUrl", objectPath);
  };

  return (
    <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
      <div className="max-w-lg mx-auto p-4">
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => setLocation("/feed")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="border-none shadow-xl">
          <CardHeader className="text-center pb-4">
            <PhotoUpload
              currentPhotoUrl={form.watch("photoUrl") ?? undefined}
              displayName={form.watch("displayName")}
              onPhotoUploaded={handlePhotoUploaded}
            />
            <div className="flex items-center justify-center gap-2 mt-4">
              <CardTitle className="text-2xl font-display">Edit Profile</CardTitle>
              {profile.isVerified && (
                <Badge className="bg-blue-500 text-white" title="Verified profile" data-testid="verified-badge-profile">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              )}
            </div>
            <CardDescription>Update your dating profile</CardDescription>
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
                        <Input 
                          placeholder="Your name" 
                          className="h-12 rounded-xl" 
                          data-testid="input-display-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="age"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Age</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min={18} 
                            className="h-12 rounded-xl"
                            data-testid="input-age"
                            {...field}
                            value={field.value}
                            onChange={e => field.onChange(parseInt(e.target.value) || 18)} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl" data-testid="select-gender">
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
                </div>

                <FormField
                  control={form.control}
                  name="interestedIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interested In</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl" data-testid="select-interested-in">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Men</SelectItem>
                          <SelectItem value="female">Women</SelectItem>
                          <SelectItem value="everyone">Everyone</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          data-testid="input-bio"
                          {...field}
                          value={field.value ?? ""} 
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

                {/* Verification Status Section */}
                {!profile.isVerified && (
                  <Link href="/verification" data-testid="link-verification-section">
                    <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl cursor-pointer hover-elevate" data-testid="div-verification-section">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {profile.verificationStatus === 'pending' ? 'Verification Pending' : 'Get Verified'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {profile.verificationStatus === 'pending' 
                            ? 'Your verification is being reviewed' 
                            : 'Build trust with a verified badge'}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </Link>
                )}

                <div className="flex gap-3">
                  <Button 
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setLocation("/feed")}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1"
                    disabled={isPending}
                    data-testid="button-save"
                  >
                    {isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function EditProfile() {
  const { data: profile, isLoading: profileLoading } = useMyProfile();

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <EditProfileForm profile={profile} />;
}
