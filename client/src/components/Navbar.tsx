import { Link, useLocation } from "wouter";
import { Heart, MessageCircle, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/use-dating";

export function Navbar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: profile } = useMyProfile();

  if (location === "/" || location === "/onboarding") return null;

  const isActive = (path: string) => location === path ? "text-primary" : "text-muted-foreground hover:text-foreground";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-border md:top-0 md:bottom-auto md:border-t-0 md:border-b safe-area-bottom">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo - Hidden on mobile, shown on desktop */}
        <Link href="/feed" className="hidden md:flex items-center gap-2 font-display font-bold text-2xl text-primary hover:opacity-80 transition-opacity">
          <Heart className="fill-current w-6 h-6" />
          <span>Crush</span>
        </Link>

        {/* Mobile & Desktop Nav Items */}
        <div className="flex flex-1 md:flex-none justify-around md:justify-end items-center md:gap-8">
          <Link href="/feed" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/feed')}`}>
            <Heart className={`w-6 h-6 ${location === '/feed' ? 'fill-current' : ''}`} />
            <span className="text-[10px] md:hidden font-medium">Discover</span>
          </Link>

          <Link href="/matches" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/matches')}`}>
            <MessageCircle className={`w-6 h-6 ${location.startsWith('/matches') || location.startsWith('/chat') ? 'fill-current' : ''}`} />
            <span className="text-[10px] md:hidden font-medium">Chat</span>
          </Link>

          <div className="hidden md:flex items-center gap-4 border-l pl-8 border-border">
            {profile && (
               <div className="flex items-center gap-2">
                 <img 
                   src={profile.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`} 
                   alt="Profile" 
                   className="w-8 h-8 rounded-full bg-secondary object-cover border border-border"
                 />
                 <span className="font-medium text-sm">{profile.displayName}</span>
               </div>
            )}
            <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout">
              <LogOut className="w-5 h-5 text-muted-foreground hover:text-destructive transition-colors" />
            </Button>
          </div>

          {/* Mobile Profile Link (just logout for now on mobile since no profile edit page in reqs yet) */}
          <button onClick={() => logout()} className="md:hidden flex flex-col items-center gap-1 text-muted-foreground hover:text-destructive transition-colors">
            <User className="w-6 h-6" />
            <span className="text-[10px] font-medium">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
