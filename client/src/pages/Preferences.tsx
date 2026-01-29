import { useMyProfile, useUpdateProfile } from "@/hooks/use-dating";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, SlidersHorizontal, Users, MapPin, ArrowLeft, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Preferences() {
  const { data: profile, isLoading } = useMyProfile();
  const { mutate: updateProfile, isPending } = useUpdateProfile();
  const { toast } = useToast();

  const [ageRange, setAgeRange] = useState<[number, number]>([18, 50]);
  const [maxDistance, setMaxDistance] = useState(50);
  const [interestedIn, setInterestedIn] = useState("everyone");

  useEffect(() => {
    if (profile) {
      setAgeRange([profile.minAgePreference || 18, profile.maxAgePreference || 50]);
      setMaxDistance(profile.maxDistance || 50);
      setInterestedIn(profile.interestedIn);
    }
  }, [profile]);

  const handleSave = () => {
    if (!profile) return;
    
    updateProfile({
      displayName: profile.displayName,
      age: profile.age,
      gender: profile.gender,
      bio: profile.bio,
      photoUrl: profile.photoUrl,
      interests: profile.interests,
      minAgePreference: ageRange[0],
      maxAgePreference: ageRange[1],
      maxDistance: maxDistance,
      interestedIn: interestedIn,
    }, {
      onSuccess: () => {
        toast({
          title: "Preferences saved",
          description: "Your dating preferences have been updated.",
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 space-y-6" data-testid="page-preferences">
      <div className="flex items-center gap-3">
        <Link href="/feed">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold" data-testid="heading-preferences">Preferences</h1>
          <p className="text-sm text-muted-foreground">Customize your dating experience</p>
        </div>
      </div>

      <Card data-testid="card-basics">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Basics</CardTitle>
              <CardDescription>Set your basic dating preferences</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Show me</Label>
            </div>
            <Select value={interestedIn} onValueChange={setInterestedIn}>
              <SelectTrigger data-testid="select-interested-in">
                <SelectValue placeholder="Select preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Men</SelectItem>
                <SelectItem value="female">Women</SelectItem>
                <SelectItem value="everyone">Everyone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <Label className="font-medium">Age range</Label>
              </div>
              <span className="text-sm font-medium text-primary" data-testid="text-age-range">
                {ageRange[0]} - {ageRange[1]}
              </span>
            </div>
            <Slider
              value={ageRange}
              onValueChange={(value) => setAgeRange(value as [number, number])}
              min={18}
              max={80}
              step={1}
              className="w-full"
              data-testid="slider-age-range"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>18</span>
              <span>80</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <Label className="font-medium">Maximum distance</Label>
              </div>
              <span className="text-sm font-medium text-primary" data-testid="text-max-distance">
                {maxDistance} mi
              </span>
            </div>
            <Slider
              value={[maxDistance]}
              onValueChange={(value) => setMaxDistance(value[0])}
              min={1}
              max={100}
              step={1}
              className="w-full"
              data-testid="slider-distance"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 mi</span>
              <span>100 mi</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button 
        onClick={handleSave} 
        disabled={isPending} 
        className="w-full"
        data-testid="button-save-preferences"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Check className="w-4 h-4 mr-2" />
        )}
        Save Preferences
      </Button>
    </div>
  );
}
