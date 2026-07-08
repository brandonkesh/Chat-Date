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
import { ArrowLeft, Loader2, X, Plus, ShieldCheck, ChevronRight, Wine, Cigarette, Dumbbell, Utensils, Dog, Baby, Church, GraduationCap, Briefcase, Heart, Home, Users, Globe, Compass, Palette, Vote, Star, Languages, Leaf, AlertCircle, CalendarDays, MapPin } from "lucide-react";
import { differenceInYears } from "date-fns";
import { PhotoUpload } from "@/components/PhotoUpload";
import { VoiceIntro } from "@/components/VoiceIntro";
import { IntroVideo } from "@/components/IntroVideo";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";
import { currentWeekKey, currentWeeklyQuestion } from "@/lib/weekly";

const PROFILE_PROMPTS = [
  "My perfect weekend involves...",
  "The way to my heart is...",
  "I'm weirdly proud of...",
  "My most controversial food opinion is...",
  "Two truths about me...",
  "I'll never stop talking about...",
  "My love language is...",
  "The best trip I ever took was...",
];

function EditProfileForm({ profile }: { profile: Profile }) {
  const [, setLocation] = useLocation();
  const { mutateAsync: updateProfile, isPending } = useUpdateProfile();
  const [newInterest, setNewInterest] = useState("");
  const [newLanguage, setNewLanguage] = useState("");
  const [dobError, setDobError] = useState("");

  const form = useForm<InsertProfile>({
    resolver: zodResolver(insertProfileSchema),
    defaultValues: {
      displayName: profile.displayName,
      bio: profile.bio ?? "",
      age: profile.age,
      dateOfBirth: profile.dateOfBirth || "",
      gender: profile.gender,
      interestedIn: profile.interestedIn,
      photoUrl: profile.photoUrl || "",
      interests: profile.interests || [],
      // Lifestyle fields
      drinking: profile.drinking || "",
      smoking: profile.smoking || "",
      marijuana: profile.marijuana || "",
      exercise: profile.exercise || "",
      diet: profile.diet || "",
      pets: profile.pets || "",
      kids: profile.kids || "",
      religion: profile.religion || "",
      education: profile.education || "",
      jobTitle: profile.jobTitle || "",
      company: profile.company || "",
      // Family fields
      relationshipGoal: profile.relationshipGoal || "",
      familyPlans: profile.familyPlans || "",
      livingSituation: profile.livingSituation || "",
      lookingForDescription: profile.lookingForDescription || "",
      // Background & Identity fields
      languages: profile.languages || [],
      orientation: profile.orientation || "",
      ethnicity: profile.ethnicity || "",
      politicalViews: profile.politicalViews || "",
      astrologicalSign: profile.astrologicalSign || "",
      zipCode: profile.zipCode || "",
      // Fun extras
      weeklyAnswer: profile.weeklyQuestionKey === currentWeekKey() ? profile.weeklyAnswer || "" : "",
      songOfTheDay: profile.songOfTheDay || "",
      promptQuestion: profile.promptQuestion || "",
      promptAnswer: profile.promptAnswer || "",
    },
  });

  const interests = form.watch("interests") || [];
  const languages = form.watch("languages") || [];

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

  const addLanguage = () => {
    const trimmed = newLanguage.trim();
    if (trimmed && !languages.includes(trimmed)) {
      form.setValue("languages", [...languages, trimmed]);
      setNewLanguage("");
    }
  };

  const removeLanguage = (lang: string) => {
    form.setValue("languages", languages.filter(l => l !== lang));
  };

  const handleLanguageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addLanguage();
    }
  };

  const onSubmit = async (data: InsertProfile) => {
    try {
      await updateProfile({
        ...data,
        weeklyQuestionKey: data.weeklyAnswer?.trim() ? currentWeekKey() : null,
      });
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
            <div className="mt-4">
              <VoiceIntro voiceIntroUrl={profile.voiceIntroUrl} editable />
              <div className="mt-3">
                <IntroVideo introVideoUrl={profile.introVideoUrl} editable />
              </div>
            </div>
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

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        Date of Birth
                        {profile.ageVerified && (
                          <Badge variant="secondary" className="ml-1" data-testid="badge-age-verified">
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Age Verified
                          </Badge>
                        )}
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
                      {!profile.ageVerified && (
                        <p className="text-xs text-muted-foreground">
                          Enter your date of birth to verify your age.
                        </p>
                      )}
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
                          <SelectItem value="nonbinary">Non-binary</SelectItem>
                          <SelectItem value="everyone">Everyone</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Zip Code
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., 90210" 
                          className="h-12 rounded-xl"
                          data-testid="input-zip-code"
                          maxLength={10}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Used to find matches near you
                      </p>
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

                {/* Fun Extras Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Star className="w-5 h-5" />
                    Fun Extras
                  </h3>

                  <FormField
                    control={form.control}
                    name="weeklyAnswer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>💬 Question of the Week: {currentWeeklyQuestion().question}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your answer shows on your card all week!"
                            data-testid="input-weekly-answer"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">A fresh question every week — answers expire when the week ends.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="songOfTheDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>🎵 Song of the Day</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Golden Hour — JVKE"
                            data-testid="input-song-of-day"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="promptQuestion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>✍️ Profile Prompt</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-prompt-question">
                              <SelectValue placeholder="Pick a prompt..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PROFILE_PROMPTS.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("promptQuestion") && (
                    <FormField
                      control={form.control}
                      name="promptAnswer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your answer</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Finish the sentence..."
                              className="min-h-[80px] rounded-xl resize-none"
                              data-testid="input-prompt-answer"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <Link href="/personality-quiz">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border hover-elevate cursor-pointer" data-testid="link-personality-quiz">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🏅</span>
                        <div>
                          <p className="text-sm font-medium">Personality Badges</p>
                          <p className="text-xs text-muted-foreground">
                            {profile.personalityBadges?.length
                              ? `You have ${profile.personalityBadges.length} badges — retake the quiz anytime`
                              : "Take the quick quiz to earn badges for your card"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                </div>

                {/* Lifestyle Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    Lifestyle
                  </h3>
                  
                  {/* Work */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="jobTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Job Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Software Engineer" 
                              className="h-12 rounded-xl"
                              data-testid="input-job-title"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Where you work" 
                              className="h-12 rounded-xl"
                              data-testid="input-company"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Education & Religion */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="education"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <GraduationCap className="w-4 h-4" />
                            Education
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-education">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="high_school">High School</SelectItem>
                              <SelectItem value="some_college">Some College</SelectItem>
                              <SelectItem value="bachelors">Bachelor's</SelectItem>
                              <SelectItem value="masters">Master's</SelectItem>
                              <SelectItem value="doctorate">Doctorate</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="religion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Church className="w-4 h-4" />
                            Religion
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-religion">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="not_religious">Not Religious</SelectItem>
                              <SelectItem value="spiritual">Spiritual</SelectItem>
                              <SelectItem value="christian">Christian</SelectItem>
                              <SelectItem value="jewish">Jewish</SelectItem>
                              <SelectItem value="muslim">Muslim</SelectItem>
                              <SelectItem value="hindu">Hindu</SelectItem>
                              <SelectItem value="buddhist">Buddhist</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Drinking & Smoking */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="drinking"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Wine className="w-4 h-4" />
                            Drinking
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-drinking">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="never">Never</SelectItem>
                              <SelectItem value="socially">Socially</SelectItem>
                              <SelectItem value="regularly">Regularly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="smoking"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Cigarette className="w-4 h-4" />
                            Smoking
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-smoking">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="never">Never</SelectItem>
                              <SelectItem value="socially">Socially</SelectItem>
                              <SelectItem value="regularly">Regularly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Marijuana */}
                  <FormField
                    control={form.control}
                    name="marijuana"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Leaf className="w-4 h-4" />
                          Marijuana
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl" data-testid="select-marijuana">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="never">Never</SelectItem>
                            <SelectItem value="socially">Socially</SelectItem>
                            <SelectItem value="regularly">Regularly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Exercise & Diet */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="exercise"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Dumbbell className="w-4 h-4" />
                            Exercise
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-exercise">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="never">Never</SelectItem>
                              <SelectItem value="sometimes">Sometimes</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="very_active">Very Active</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="diet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Utensils className="w-4 h-4" />
                            Diet
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-diet">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="anything">Anything</SelectItem>
                              <SelectItem value="vegetarian">Vegetarian</SelectItem>
                              <SelectItem value="vegan">Vegan</SelectItem>
                              <SelectItem value="pescatarian">Pescatarian</SelectItem>
                              <SelectItem value="kosher">Kosher</SelectItem>
                              <SelectItem value="halal">Halal</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Pets & Kids */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="pets"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Dog className="w-4 h-4" />
                            Pets
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-pets">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No Pets</SelectItem>
                              <SelectItem value="have_dog">Have Dog(s)</SelectItem>
                              <SelectItem value="have_cat">Have Cat(s)</SelectItem>
                              <SelectItem value="have_other">Have Other Pets</SelectItem>
                              <SelectItem value="want_pets">Want Pets</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="kids"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Baby className="w-4 h-4" />
                            Kids
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-kids">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="have_and_want_more">Have & Want More</SelectItem>
                              <SelectItem value="have_and_done">Have & Done</SelectItem>
                              <SelectItem value="want_someday">Want Someday</SelectItem>
                              <SelectItem value="dont_want">Don't Want</SelectItem>
                              <SelectItem value="not_sure">Not Sure</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* What I'm Looking For Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Heart className="w-5 h-5" />
                    What I'm Looking For
                  </h3>

                  <FormField
                    control={form.control}
                    name="lookingForDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Heart className="w-4 h-4" />
                          In my own words
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Describe the kind of person or relationship you're looking for... (e.g. Someone adventurous who loves hiking and deep conversations)"
                            className="rounded-xl resize-none min-h-[100px]"
                            maxLength={300}
                            data-testid="textarea-looking-for"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground text-right">
                          {(field.value ?? "").length}/300
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="relationshipGoal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Heart className="w-4 h-4" />
                          Looking For
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl" data-testid="select-relationship-goal">
                              <SelectValue placeholder="What are you looking for?" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="casual">Something Casual</SelectItem>
                            <SelectItem value="serious">Serious Relationship</SelectItem>
                            <SelectItem value="marriage">Marriage</SelectItem>
                            <SelectItem value="not_sure">Not Sure Yet</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="familyPlans"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            Family Plans
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-family-plans">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="want_kids">Want Kids</SelectItem>
                              <SelectItem value="dont_want_kids">Don't Want Kids</SelectItem>
                              <SelectItem value="have_kids">Already Have Kids</SelectItem>
                              <SelectItem value="open_to_kids">Open to Kids</SelectItem>
                              <SelectItem value="not_sure">Not Sure</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="livingSituation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Home className="w-4 h-4" />
                            Living Situation
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-living-situation">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="alone">Living Alone</SelectItem>
                              <SelectItem value="with_roommates">With Roommates</SelectItem>
                              <SelectItem value="with_family">With Family</SelectItem>
                              <SelectItem value="with_partner">With Partner</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Background & Identity Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Background & Identity
                  </h3>

                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Languages className="w-4 h-4" />
                      Languages
                    </FormLabel>
                    <div className="flex gap-2">
                      <Input
                        value={newLanguage}
                        onChange={(e) => setNewLanguage(e.target.value)}
                        onKeyDown={handleLanguageKeyDown}
                        placeholder="Add a language..."
                        className="h-12 rounded-xl flex-1"
                        data-testid="input-language"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={addLanguage}
                        data-testid="button-add-language"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {languages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3" data-testid="languages-list">
                        {languages.map((lang) => (
                          <Badge 
                            key={lang} 
                            variant="secondary" 
                            className="px-3 py-1 text-sm"
                          >
                            {lang}
                            <button
                              type="button"
                              onClick={() => removeLanguage(lang)}
                              className="ml-2 hover:text-destructive"
                              data-testid={`button-remove-language-${lang}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </FormItem>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="orientation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Compass className="w-4 h-4" />
                            Orientation
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-orientation">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="straight">Straight</SelectItem>
                              <SelectItem value="gay">Gay</SelectItem>
                              <SelectItem value="lesbian">Lesbian</SelectItem>
                              <SelectItem value="bisexual">Bisexual</SelectItem>
                              <SelectItem value="pansexual">Pansexual</SelectItem>
                              <SelectItem value="asexual">Asexual</SelectItem>
                              <SelectItem value="queer">Queer</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ethnicity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Palette className="w-4 h-4" />
                            Ethnicity
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-ethnicity">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="asian">Asian</SelectItem>
                              <SelectItem value="black">Black / African American</SelectItem>
                              <SelectItem value="hispanic">Hispanic / Latino</SelectItem>
                              <SelectItem value="middle_eastern">Middle Eastern</SelectItem>
                              <SelectItem value="native_american">Native American</SelectItem>
                              <SelectItem value="pacific_islander">Pacific Islander</SelectItem>
                              <SelectItem value="white">White / Caucasian</SelectItem>
                              <SelectItem value="mixed">Mixed / Multiracial</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="politicalViews"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Vote className="w-4 h-4" />
                            Politics
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-politics">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="liberal">Liberal</SelectItem>
                              <SelectItem value="moderate">Moderate</SelectItem>
                              <SelectItem value="conservative">Conservative</SelectItem>
                              <SelectItem value="apolitical">Apolitical</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="astrologicalSign"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Star className="w-4 h-4" />
                            Zodiac Sign
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl" data-testid="select-zodiac">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="aries">Aries</SelectItem>
                              <SelectItem value="taurus">Taurus</SelectItem>
                              <SelectItem value="gemini">Gemini</SelectItem>
                              <SelectItem value="cancer">Cancer</SelectItem>
                              <SelectItem value="leo">Leo</SelectItem>
                              <SelectItem value="virgo">Virgo</SelectItem>
                              <SelectItem value="libra">Libra</SelectItem>
                              <SelectItem value="scorpio">Scorpio</SelectItem>
                              <SelectItem value="sagittarius">Sagittarius</SelectItem>
                              <SelectItem value="capricorn">Capricorn</SelectItem>
                              <SelectItem value="aquarius">Aquarius</SelectItem>
                              <SelectItem value="pisces">Pisces</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

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
