import { useMyProfile, useUpdateProfile } from "@/hooks/use-dating";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, SlidersHorizontal, Users, MapPin, ArrowLeft, Check, Navigation, Sparkles, Dumbbell, Ruler, ChevronRight, ShieldCheck, BadgeCheck, Globe, Compass, Palette, Vote, Star, Languages, Church, GraduationCap, Briefcase, Wine, Cigarette, Leaf, Utensils, Baby, PawPrint, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { VoiceIntro } from "@/components/VoiceIntro";

function formatIdentityValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function IdentityRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0" data-testid={`identity-row-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-sm font-medium ${value ? '' : 'text-muted-foreground'}`}>
        {value || "Not set"}
      </span>
    </div>
  );
}

export default function Preferences() {
  const { data: profile, isLoading } = useMyProfile();
  const { mutate: updateProfile, isPending } = useUpdateProfile();
  const { toast } = useToast();

  const [ageRange, setAgeRange] = useState<[number, number]>([18, 50]);
  const [maxDistance, setMaxDistance] = useState(50);
  const [interestedIn, setInterestedIn] = useState("everyone");
  const [locationName, setLocationName] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<string | null>(null);
  const [longitude, setLongitude] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [looksPreference, setLooksPreference] = useState("any");
  const [bodyTypePreference, setBodyTypePreference] = useState("any");
  const [heightRange, setHeightRange] = useState<[number, number]>([48, 84]); // 4'0" to 7'0"

  // Helper to format height in feet and inches
  const formatHeight = (inches: number) => {
    const feet = Math.floor(inches / 12);
    const remainingInches = inches % 12;
    return `${feet}'${remainingInches}"`;
  };

  useEffect(() => {
    if (profile) {
      setAgeRange([profile.minAgePreference || 18, profile.maxAgePreference || 50]);
      setMaxDistance(profile.maxDistance || 50);
      setInterestedIn(profile.interestedIn);
      setLocationName(profile.locationName || null);
      setLatitude(profile.latitude || null);
      setLongitude(profile.longitude || null);
      setLooksPreference(profile.looksPreference || "any");
      setBodyTypePreference(profile.bodyTypePreference || "any");
      setHeightRange([profile.minHeightPreference || 48, profile.maxHeightPreference || 84]);
    }
  }, [profile]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location not supported",
        description: "Your browser doesn't support geolocation.",
        variant: "destructive",
      });
      return;
    }

    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toString();
        const lng = position.coords.longitude.toString();
        setLatitude(lat);
        setLongitude(lng);

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`
          );
          const data = await response.json();
          
          const city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality;
          const state = data.address?.state;
          const country = data.address?.country;
          
          let displayName = "";
          if (city && state) {
            displayName = `${city}, ${state}`;
          } else if (city && country) {
            displayName = `${city}, ${country}`;
          } else if (state && country) {
            displayName = `${state}, ${country}`;
          } else {
            displayName = data.display_name?.split(",").slice(0, 2).join(",") || "Location set";
          }
          
          setLocationName(displayName);
          toast({
            title: "Location updated",
            description: `Your location is set to ${displayName}`,
          });
        } catch {
          setLocationName("Location set");
          toast({
            title: "Location captured",
            description: "Your coordinates have been saved.",
          });
        }
        
        setIsGettingLocation(false);
      },
      (error) => {
        setIsGettingLocation(false);
        let message = "Unable to get your location.";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Please allow location access in your browser settings.";
        }
        toast({
          title: "Location error",
          description: message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

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
      locationName: locationName,
      latitude: latitude,
      longitude: longitude,
      looksPreference: looksPreference,
      bodyTypePreference: bodyTypePreference,
      minHeightPreference: heightRange[0],
      maxHeightPreference: heightRange[1],
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

      <Card data-testid="card-age-verification">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${profile.ageVerified ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
              <ShieldCheck className={`w-4 h-4 ${profile.ageVerified ? 'text-green-500' : 'text-amber-500'}`} />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Age Verification</CardTitle>
              <CardDescription>
                {profile.ageVerified ? "Your age has been verified" : "Verify your age for a trusted profile"}
              </CardDescription>
            </div>
            {profile.ageVerified && (
              <Badge variant="secondary" data-testid="badge-age-verified-status">
                <Check className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Date of Birth</span>
              <span className="text-sm font-medium" data-testid="text-dob-display">
                {profile.dateOfBirth ? new Date(profile.dateOfBirth + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Not provided"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Age</span>
              <span className="text-sm font-medium" data-testid="text-age-display">{profile.age}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`text-sm font-medium ${profile.ageVerified ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} data-testid="text-age-status">
                {profile.ageVerified ? "Verified" : "Not Verified"}
              </span>
            </div>
            {!profile.ageVerified && (
              <Link href="/profile/edit">
                <Button variant="outline" className="w-full mt-2" data-testid="button-verify-age">
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Verify Age
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-location">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Current Location</CardTitle>
              <CardDescription>Set your location for nearby matches</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              {locationName ? (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate" data-testid="text-location-name">
                    {locationName}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground" data-testid="text-no-location">
                  No location set
                </span>
              )}
            </div>
            <Button
              variant="outline"
              onClick={getCurrentLocation}
              disabled={isGettingLocation}
              data-testid="button-get-location"
            >
              {isGettingLocation ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Navigation className="w-4 h-4 mr-2" />
              )}
              {locationName ? "Update" : "Get Location"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                <SelectItem value="nonbinary">Non-binary</SelectItem>
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

      <Card data-testid="card-appearance">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-pink-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Looks</CardTitle>
              <CardDescription>What you're looking for in a match</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Looks preference</Label>
            </div>
            <Select value={looksPreference} onValueChange={setLooksPreference}>
              <SelectTrigger data-testid="select-looks">
                <SelectValue placeholder="Select looks preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preference</SelectItem>
                <SelectItem value="attractive">Very attractive</SelectItem>
                <SelectItem value="above_average">Above average</SelectItem>
                <SelectItem value="average">Average</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Body type preference</Label>
            </div>
            <Select value={bodyTypePreference} onValueChange={setBodyTypePreference}>
              <SelectTrigger data-testid="select-body-type">
                <SelectValue placeholder="Select body type preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preference</SelectItem>
                <SelectItem value="slim">Slim</SelectItem>
                <SelectItem value="athletic">Athletic</SelectItem>
                <SelectItem value="average">Average</SelectItem>
                <SelectItem value="curvy">Curvy</SelectItem>
                <SelectItem value="plus_size">Plus size</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-muted-foreground" />
                <Label className="font-medium">Height range</Label>
              </div>
              <span className="text-sm font-medium text-primary" data-testid="text-height-range">
                {formatHeight(heightRange[0])} - {formatHeight(heightRange[1])}
              </span>
            </div>
            <Slider
              value={heightRange}
              onValueChange={(value) => setHeightRange(value as [number, number])}
              min={48}
              max={84}
              step={1}
              className="w-full"
              data-testid="slider-height-range"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>4'0"</span>
              <span>7'0"</span>
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

      <VoiceIntro voiceIntroUrl={profile?.voiceIntroUrl} editable />

      <Card data-testid="card-lifestyle">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
              <Wine className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Lifestyle</CardTitle>
              <CardDescription>Your habits and preferences</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <IdentityRow
              icon={<Wine className="w-4 h-4" />}
              label="Alcohol"
              value={formatIdentityValue(profile?.drinking)}
            />
            <IdentityRow
              icon={<Cigarette className="w-4 h-4" />}
              label="Smoking"
              value={formatIdentityValue(profile?.smoking)}
            />
            <IdentityRow
              icon={<Leaf className="w-4 h-4" />}
              label="Marijuana"
              value={formatIdentityValue(profile?.marijuana)}
            />
            <IdentityRow
              icon={<Utensils className="w-4 h-4" />}
              label="Diet"
              value={formatIdentityValue(profile?.diet)}
            />
          </div>

          <Link href="/profile/edit" className="block">
            <Button variant="outline" className="w-full justify-between" data-testid="button-edit-lifestyle">
              <span className="flex items-center gap-2">
                <Wine className="w-4 h-4" />
                Edit Lifestyle
              </span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card data-testid="card-family">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center">
              <Home className="w-4 h-4 text-pink-500 dark:text-pink-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Family</CardTitle>
              <CardDescription>Pets, kids, and family plans</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <IdentityRow
              icon={<PawPrint className="w-4 h-4" />}
              label="Pets"
              value={formatIdentityValue(profile?.pets)}
            />
            <IdentityRow
              icon={<Baby className="w-4 h-4" />}
              label="Has Kids"
              value={formatIdentityValue(profile?.kids)}
            />
            <IdentityRow
              icon={<Users className="w-4 h-4" />}
              label="Wants Kids"
              value={formatIdentityValue(profile?.familyPlans)}
            />
          </div>

          <Link href="/profile/edit" className="block">
            <Button variant="outline" className="w-full justify-between" data-testid="button-edit-family">
              <span className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Edit Family
              </span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card data-testid="card-identity">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Background & Identity</CardTitle>
              <CardDescription>Your background details and verification</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-3">
              <BadgeCheck className={`w-5 h-5 ${profile?.isVerified ? 'text-blue-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-medium text-sm">Photo Verification</p>
                <p className="text-xs text-muted-foreground">
                  {profile?.isVerified ? 'Your profile is verified' : 'Verify your identity with a selfie'}
                </p>
              </div>
            </div>
            {profile?.isVerified ? (
              <span className="text-xs font-medium text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">Verified</span>
            ) : (
              <Link href="/verification">
                <Button variant="outline" size="sm" data-testid="button-verify">
                  Verify
                </Button>
              </Link>
            )}
          </div>

          <div className="space-y-3">
            <IdentityRow
              icon={<Languages className="w-4 h-4" />}
              label="Languages"
              value={profile?.languages?.length ? profile.languages.join(", ") : null}
            />
            <IdentityRow
              icon={<Compass className="w-4 h-4" />}
              label="Orientation"
              value={formatIdentityValue(profile?.orientation)}
            />
            <IdentityRow
              icon={<Palette className="w-4 h-4" />}
              label="Ethnicity"
              value={formatIdentityValue(profile?.ethnicity)}
            />
            <IdentityRow
              icon={<Church className="w-4 h-4" />}
              label="Religion"
              value={formatIdentityValue(profile?.religion)}
            />
            <IdentityRow
              icon={<Vote className="w-4 h-4" />}
              label="Politics"
              value={formatIdentityValue(profile?.politicalViews)}
            />
            <IdentityRow
              icon={<GraduationCap className="w-4 h-4" />}
              label="Education"
              value={formatIdentityValue(profile?.education)}
            />
            <IdentityRow
              icon={<Briefcase className="w-4 h-4" />}
              label="Employment"
              value={profile?.jobTitle ? `${profile.jobTitle}${profile.company ? ` at ${profile.company}` : ''}` : null}
            />
            <IdentityRow
              icon={<Star className="w-4 h-4" />}
              label="Zodiac Sign"
              value={formatIdentityValue(profile?.astrologicalSign)}
            />
          </div>

          <Link href="/profile/edit" className="block">
            <Button variant="outline" className="w-full justify-between" data-testid="button-edit-identity">
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Edit Background & Identity
              </span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

    </div>
  );
}
