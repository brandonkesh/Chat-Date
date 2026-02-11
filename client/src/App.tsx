import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-dating";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

// Pages
import Landing from "@/pages/Landing";
import Onboarding from "@/pages/Onboarding";
import Feed from "@/pages/Feed";
import Matches from "@/pages/Matches";
import Chat from "@/pages/Chat";
import Inbox from "@/pages/Inbox";
import Premium from "@/pages/Premium";
import EditProfile from "@/pages/EditProfile";
import Verification from "@/pages/Verification";
import Recommendations from "@/pages/Recommendations";
import Preferences from "@/pages/Preferences";
import VideoCall from "@/pages/VideoCall";
import AIMatches from "@/pages/AIMatches";
import Help from "@/pages/Help";
import AboutUs from "@/pages/AboutUs";
import TwoFactorSetup from "@/pages/TwoFactorSetup";
import TwoFactorChallenge from "@/pages/TwoFactorChallenge";
import EmailVerification from "@/pages/EmailVerification";
import MicroDate from "@/pages/MicroDate";
import AppLock from "@/pages/AppLock";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/Navbar";

type TwoFactorStatus = {
  enabled: boolean;
  verified: boolean;
};

type PasswordStatus = {
  hasPassword: boolean;
  appLockVerified: boolean;
};

function ProtectedRoute({ component: Component, skip2FA = false }: { component: React.ComponentType; skip2FA?: boolean }) {
  const { user, isLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const [, setLocation] = useLocation();

  const { data: twoFactorStatus, isLoading: twoFALoading } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/2fa/status"],
    enabled: !!user && !!profile && !skip2FA,
  });

  const { data: passwordStatus, isLoading: passwordLoading } = useQuery<PasswordStatus>({
    queryKey: ["/api/password/status"],
    enabled: !!user && !!profile,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/");
    } else if (!isLoading && user && !profileLoading && !profile) {
      setLocation("/onboarding");
    }
  }, [user, isLoading, profile, profileLoading, setLocation]);

  if (isLoading || profileLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (user && !profile) return null;
  if (!user) return null;

  if (!skip2FA && twoFALoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!skip2FA && twoFactorStatus?.enabled && !twoFactorStatus?.verified) {
    return <TwoFactorChallenge />;
  }

  if (passwordLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (passwordStatus?.hasPassword && !passwordStatus?.appLockVerified) {
    return <AppLock onUnlock={() => queryClient.invalidateQueries({ queryKey: ["/api/password/status"] })} />;
  }

  return <Component />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <>
      <Switch>
        <Route path="/">
          {user ? <ProtectedRoute component={Feed} /> : <Landing />}
        </Route>
        
        {/* Onboarding is special: protected but doesn't require profile existing yet */}
        <Route path="/onboarding">
          {user ? <Onboarding /> : <Landing />}
        </Route>

        <Route path="/feed">
          <ProtectedRoute component={Feed} />
        </Route>
        
        <Route path="/matches">
          <ProtectedRoute component={Matches} />
        </Route>
        
        <Route path="/chat/:id">
          <ProtectedRoute component={Chat} />
        </Route>

        <Route path="/video-call/:id">
          <ProtectedRoute component={VideoCall} />
        </Route>

        <Route path="/inbox">
          <ProtectedRoute component={Inbox} />
        </Route>

        <Route path="/premium">
          <ProtectedRoute component={Premium} />
        </Route>

        <Route path="/profile/edit">
          <ProtectedRoute component={EditProfile} />
        </Route>

        <Route path="/verification">
          <ProtectedRoute component={Verification} />
        </Route>

        <Route path="/recommendations">
          <ProtectedRoute component={Recommendations} />
        </Route>

        <Route path="/preferences">
          <ProtectedRoute component={Preferences} />
        </Route>

        <Route path="/ai-matches">
          <ProtectedRoute component={AIMatches} />
        </Route>

        <Route path="/help">
          <ProtectedRoute component={Help} />
        </Route>

        <Route path="/about">
          <ProtectedRoute component={AboutUs} />
        </Route>

        <Route path="/security/2fa">
          <ProtectedRoute component={TwoFactorSetup} skip2FA />
        </Route>

        <Route path="/security/email-verification">
          <ProtectedRoute component={EmailVerification} />
        </Route>

        <Route path="/micro-date/:id">
          <ProtectedRoute component={MicroDate} />
        </Route>
        
        <Route component={NotFound} />
      </Switch>
      <Navbar />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
