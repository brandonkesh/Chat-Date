import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/Navbar";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const [, setLocation] = useLocation();

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

  // If we have a user but no profile, and we aren't on onboarding, effect redirects.
  // We return null here to prevent flashing protected content.
  if (user && !profile) return null;
  if (!user) return null;

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
