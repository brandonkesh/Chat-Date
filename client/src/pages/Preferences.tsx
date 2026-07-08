import { useMyProfile, useUpdateProfile } from "@/hooks/use-dating";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, SlidersHorizontal, Users, MapPin, ArrowLeft, Check, Navigation, Sparkles, Dumbbell, Ruler, ChevronRight, ShieldCheck, BadgeCheck, Globe, Compass, Palette, Vote, Star, Languages, Church, GraduationCap, Briefcase, Wine, Cigarette, Leaf, Utensils, Baby, PawPrint, Home, Shield, Mail, Ban, UserX, Lock, Eye, EyeOff, KeyRound, Copy, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { VoiceIntro } from "@/components/VoiceIntro";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { Profile, Block } from "@shared/schema";

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

  const { data: twoFactorStatus } = useQuery<{ enabled: boolean; verified: boolean }>({
    queryKey: ["/api/2fa/status"],
  });

  const queryClientRef = useQueryClient();
  const { data: passwordStatus } = useQuery<{ hasPassword: boolean; backupCodesCount: number }>({
    queryKey: ["/api/password/status"],
  });

  const [passwordMode, setPasswordMode] = useState<"idle" | "set" | "change" | "remove">("idle");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const setPasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/password/set", { password });
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      queryClientRef.invalidateQueries({ queryKey: ["/api/password/status"] });
      queryClientRef.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({ title: "Password Set", description: "Save your backup codes!" });
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMode("idle");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to set password.", variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/password/change", { currentPassword, newPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClientRef.invalidateQueries({ queryKey: ["/api/password/status"] });
      toast({ title: "Password Changed" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMode("idle");
    },
    onError: () => {
      toast({ title: "Error", description: "Current password is incorrect.", variant: "destructive" });
    },
  });

  const removePasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/password/remove", { password });
      return res.json();
    },
    onSuccess: () => {
      queryClientRef.invalidateQueries({ queryKey: ["/api/password/status"] });
      queryClientRef.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      toast({ title: "Password Removed" });
      setCurrentPassword("");
      setPasswordMode("idle");
    },
    onError: () => {
      toast({ title: "Error", description: "Password is incorrect.", variant: "destructive" });
    },
  });

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
    <div className="max-w-lg mx-auto p-4 md:p-6 pb-24 md:pt-20 space-y-6" data-testid="page-preferences">
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

      <Link href="/ai-advisor" className="block">
        <Card className="hover-elevate" data-testid="card-profile-optimizer">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium">AI Profile Optimizer</h3>
                <p className="text-sm text-muted-foreground">Get AI-powered tips to improve your profile</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>

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

      <Card data-testid="card-app-lock">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${passwordStatus?.hasPassword ? 'bg-green-500/10' : 'bg-muted'}`}>
              <Lock className={`w-4 h-4 ${passwordStatus?.hasPassword ? 'text-green-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">App Lock Password</CardTitle>
              <CardDescription>
                {passwordStatus?.hasPassword ? "Your app is protected with a password" : "Add a password to protect your privacy"}
              </CardDescription>
            </div>
            {passwordStatus?.hasPassword && (
              <Badge variant="secondary" data-testid="badge-password-enabled">
                <Check className="w-3 h-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {backupCodes && (
              <div className="bg-muted p-4 rounded-md space-y-3" data-testid="backup-codes-display">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Your Backup Codes</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Save these codes somewhere safe. You can use them to recover your account if you forget your password. Each code can only be used once.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, idx) => (
                    <div key={idx} className="font-mono text-sm bg-background px-3 py-1.5 rounded border border-border text-center" data-testid={`text-backup-code-${idx}`}>
                      {code}
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(backupCodes.join("\n"));
                    toast({ title: "Copied to clipboard" });
                  }}
                  data-testid="button-copy-backup-codes"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy All Codes
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={() => setBackupCodes(null)}
                  data-testid="button-dismiss-backup-codes"
                >
                  I've Saved My Codes
                </Button>
              </div>
            )}

            {passwordMode === "idle" && !backupCodes && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className={`text-sm font-medium ${passwordStatus?.hasPassword ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} data-testid="text-password-status">
                    {passwordStatus?.hasPassword ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {passwordStatus?.hasPassword && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Backup Codes</span>
                    <span className="text-sm font-medium" data-testid="text-backup-codes-count">{passwordStatus.backupCodesCount} remaining</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {passwordStatus?.hasPassword
                    ? "You'll need to enter your password each time you open the app."
                    : "Set a password to lock your app. You'll be asked for it each time you open Crush."}
                </p>
                {!passwordStatus?.hasPassword ? (
                  <Button
                    className="w-full mt-2"
                    onClick={() => setPasswordMode("set")}
                    data-testid="button-set-password"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Set Password
                  </Button>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setPasswordMode("change")}
                      data-testid="button-change-password"
                    >
                      Change Password
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setPasswordMode("remove")}
                      data-testid="button-remove-password"
                    >
                      Remove Password
                    </Button>
                  </div>
                )}
              </>
            )}

            {passwordMode === "set" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="new-pw" className="text-sm">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-pw"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 4 characters"
                      data-testid="input-new-password"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirm-pw" className="text-sm">Confirm Password</Label>
                  <Input
                    id="confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    data-testid="input-confirm-password"
                  />
                </div>
                {newPassword.length > 0 && newPassword.length < 4 && (
                  <p className="text-xs text-destructive">Password must be at least 4 characters.</p>
                )}
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords don't match.</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setPasswordMode("idle"); setNewPassword(""); setConfirmPassword(""); }} data-testid="button-cancel-set-password">
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={newPassword.length < 4 || newPassword !== confirmPassword || setPasswordMutation.isPending}
                    onClick={() => setPasswordMutation.mutate(newPassword)}
                    data-testid="button-save-password"
                  >
                    {setPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set Password"}
                  </Button>
                </div>
              </div>
            )}

            {passwordMode === "change" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="current-pw" className="text-sm">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-pw"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      data-testid="input-current-password"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-pw-change" className="text-sm">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-pw-change"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 4 characters"
                      data-testid="input-new-password-change"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirm-pw-change" className="text-sm">Confirm New Password</Label>
                  <Input
                    id="confirm-pw-change"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    data-testid="input-confirm-password-change"
                  />
                </div>
                {newPassword.length > 0 && newPassword.length < 4 && (
                  <p className="text-xs text-destructive">Password must be at least 4 characters.</p>
                )}
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords don't match.</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setPasswordMode("idle"); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }} data-testid="button-cancel-change-password">
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!currentPassword || newPassword.length < 4 || newPassword !== confirmPassword || changePasswordMutation.isPending}
                    onClick={() => changePasswordMutation.mutate({ currentPassword, newPassword })}
                    data-testid="button-save-change-password"
                  >
                    {changePasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Change Password"}
                  </Button>
                </div>
              </div>
            )}

            {passwordMode === "remove" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Enter your current password to remove the app lock.</p>
                <div className="space-y-1">
                  <Label htmlFor="remove-pw" className="text-sm">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="remove-pw"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      data-testid="input-remove-password"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setPasswordMode("idle"); setCurrentPassword(""); }} data-testid="button-cancel-remove-password">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={!currentPassword || removePasswordMutation.isPending}
                    onClick={() => removePasswordMutation.mutate(currentPassword)}
                    data-testid="button-confirm-remove-password"
                  >
                    {removePasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remove Password"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-two-factor">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${twoFactorStatus?.enabled ? 'bg-green-500/10' : 'bg-muted'}`}>
              <Shield className={`w-4 h-4 ${twoFactorStatus?.enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Two-Step Verification</CardTitle>
              <CardDescription>
                {twoFactorStatus?.enabled ? "Your account has extra security" : "Add an extra layer of security"}
              </CardDescription>
            </div>
            {twoFactorStatus?.enabled && (
              <Badge variant="secondary" data-testid="badge-2fa-enabled">
                <Check className="w-3 h-3 mr-1" />
                Enabled
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`text-sm font-medium ${twoFactorStatus?.enabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} data-testid="text-2fa-status">
                {twoFactorStatus?.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {twoFactorStatus?.enabled
                ? "You'll need to enter a code from your authenticator app each time you sign in."
                : "Use an authenticator app to generate a verification code each time you sign in."}
            </p>
            <Link href="/security/2fa">
              <Button
                variant={twoFactorStatus?.enabled ? "outline" : "default"}
                className="w-full mt-2"
                data-testid="button-manage-2fa"
              >
                <Shield className="w-4 h-4 mr-2" />
                {twoFactorStatus?.enabled ? "Manage Two-Step Verification" : "Enable Two-Step Verification"}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-email-verification">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${profile?.emailVerified ? 'bg-green-500/10' : 'bg-muted'}`}>
              <Mail className={`w-4 h-4 ${profile?.emailVerified ? 'text-green-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Email Verification</CardTitle>
              <CardDescription>
                {profile?.emailVerified ? "Your email address is verified" : "Verify your email for account security"}
              </CardDescription>
            </div>
            {profile?.emailVerified && (
              <Badge variant="secondary" data-testid="badge-email-verified">
                <Check className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`text-sm font-medium ${profile?.emailVerified ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} data-testid="text-email-status">
                {profile?.emailVerified ? "Verified" : "Not Verified"}
              </span>
            </div>
            {!profile?.emailVerified && (
              <Link href="/security/email-verification">
                <Button variant="default" className="w-full mt-2" data-testid="button-verify-email">
                  <Mail className="w-4 h-4 mr-2" />
                  Verify Email
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
          <div className="flex items-center justify-between gap-4 pt-2 border-t">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">Zip Code</span>
              </div>
              <p className="text-sm font-medium mt-1" data-testid="text-zip-code">
                {profile?.zipCode || "Not set"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                People in your zip code are prioritized in matchmaking
              </p>
            </div>
            <Link href="/profile/edit">
              <Button variant="outline" data-testid="button-edit-zip-code">
                {profile?.zipCode ? "Change" : "Add"}
              </Button>
            </Link>
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
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent" />
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
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
              <Home className="w-4 h-4 text-accent" />
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
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary" />
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

      <BlockedUsersCard />

      <DeleteProfileCard />

    </div>
  );
}

function DeleteProfileCard() {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/account");
    },
    onSuccess: () => {
      // Account and session are gone — send the user back to the landing page.
      window.location.href = "/";
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not delete your profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="border-destructive/40" data-testid="card-delete-profile">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-destructive" />
          <div>
            <CardTitle className="text-base">Delete My Profile</CardTitle>
            <CardDescription className="text-xs">
              Permanently remove your profile and all your data
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This permanently deletes your profile, photos, matches, messages, and
          everything else tied to your account. This cannot be undone.
        </p>
        <AlertDialog onOpenChange={(open) => { if (!open) setConfirmText(""); }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="button-delete-profile">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete My Profile
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent data-testid="dialog-delete-profile">
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your profile, matches, messages, and
                all of your data. There is no way to get it back. Type{" "}
                <span className="font-semibold text-foreground">DELETE</span> below
                to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              data-testid="input-delete-confirm"
            />
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText.trim().toUpperCase() !== "DELETE" || deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  deleteMutation.mutate();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Delete Forever"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function BlockedUsersCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: blockedUsers, isLoading } = useQuery<{ block: Block; profile: Profile }[]>({
    queryKey: ["/api/blocks"],
  });

  const unblockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/blocks/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "User Unblocked", description: "This person can see your profile and contact you again." });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not unblock this user.", variant: "destructive" });
    },
  });

  const count = blockedUsers?.length || 0;

  return (
    <Card data-testid="card-blocked-users">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Ban className="w-5 h-5 text-destructive" />
          <div>
            <CardTitle className="text-base">Blocked Users</CardTitle>
            <CardDescription className="text-xs">
              {count === 0 ? "No blocked users" : `${count} blocked`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground py-2" data-testid="text-no-blocked-users">
            You haven't blocked anyone. Blocked users can't see your profile or contact you.
          </p>
        ) : (
          <div className="space-y-2">
            {blockedUsers!.map(({ block, profile: blockedProfile }) => (
              <div
                key={block.id}
                className="flex items-center justify-between gap-3 p-2 rounded-md border border-border"
                data-testid={`blocked-user-${blockedProfile.userId}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={blockedProfile.photoUrl || undefined} alt={blockedProfile.displayName} />
                    <AvatarFallback>
                      <UserX className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{blockedProfile.displayName}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unblockMutation.mutate(blockedProfile.userId)}
                  disabled={unblockMutation.isPending}
                  data-testid={`button-unblock-${blockedProfile.userId}`}
                >
                  {unblockMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Unblock"
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
