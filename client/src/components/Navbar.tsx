import { Link, useLocation } from "wouter";
import { Heart, MessageCircle, Mail, CreditCard, LogOut, User, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-dating";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: profile } = useMyProfile();

  if (location === "/" || location === "/onboarding") return null;

  const isActive = (path: string) => location === path ? "text-primary" : "text-muted-foreground hover:text-foreground";

  const avatarUrl = profile?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.displayName || 'user'}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-border safe-area-bottom md:hidden">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-around">
        <Link href="/feed" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/feed')}`} data-testid="nav-discover">
          <Heart className={`w-6 h-6 ${location === '/feed' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">Discover</span>
        </Link>

        <Link href="/matches" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/matches')}`} data-testid="nav-matches">
          <MessageCircle className={`w-6 h-6 ${location === '/matches' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">Matches</span>
        </Link>

        <Link href="/inbox" className={`flex flex-col items-center gap-1 transition-colors ${location.startsWith('/inbox') || location.startsWith('/chat') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} data-testid="nav-inbox">
          <Mail className={`w-6 h-6 ${location.startsWith('/inbox') || location.startsWith('/chat') ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">Inbox</span>
        </Link>

        <Link href="/premium" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/premium')}`} data-testid="nav-premium">
          <CreditCard className={`w-6 h-6 ${location === '/premium' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">Premium</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-col items-center gap-1 text-muted-foreground" data-testid="button-profile-menu-mobile">
              <Avatar className="w-6 h-6 border border-border">
                <AvatarImage src={avatarUrl} alt={profile?.displayName || 'Profile'} />
                <AvatarFallback><User className="w-3 h-3" /></AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium">Profile</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-sm font-medium">
              {profile?.displayName}
            </div>
            <DropdownMenuSeparator />
            <Link href="/profile/edit">
              <DropdownMenuItem data-testid="button-edit-profile-mobile">
                <Pencil className="w-4 h-4 mr-2" />
                Edit Profile
              </DropdownMenuItem>
            </Link>
            <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive" data-testid="button-logout-mobile">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
