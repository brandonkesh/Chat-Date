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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const avatarUrl = profile?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.displayName || 'user'}`;

  return (
    <>
      {/* Top Navigation - Always visible */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/feed" className="flex items-center gap-2 font-display font-bold text-2xl text-primary hover:opacity-80 transition-opacity">
            <Heart className="fill-current w-6 h-6" />
            <span>Crush</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/feed" className={`flex items-center gap-2 transition-colors ${isActive('/feed')}`} data-testid="nav-discover-desktop">
              <Heart className={`w-5 h-5 ${location === '/feed' ? 'fill-current' : ''}`} />
              <span className="font-medium">Discover</span>
            </Link>

            <Link href="/matches" className={`flex items-center gap-2 transition-colors ${isActive('/matches')}`} data-testid="nav-matches-desktop">
              <MessageCircle className={`w-5 h-5 ${location === '/matches' ? 'fill-current' : ''}`} />
              <span className="font-medium">Matches</span>
            </Link>

            <Link href="/inbox" className={`flex items-center gap-2 transition-colors ${location.startsWith('/inbox') || location.startsWith('/chat') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} data-testid="nav-inbox-desktop">
              <Mail className={`w-5 h-5 ${location.startsWith('/inbox') || location.startsWith('/chat') ? 'fill-current' : ''}`} />
              <span className="font-medium">Inbox</span>
            </Link>

            <Link href="/premium" className={`flex items-center gap-2 transition-colors ${isActive('/premium')}`} data-testid="nav-premium-desktop">
              <CreditCard className={`w-5 h-5 ${location === '/premium' ? 'fill-current' : ''}`} />
              <span className="font-medium">Premium</span>
            </Link>

            <div className="border-l pl-6 border-border">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="button-profile-menu">
                    <Avatar className="w-8 h-8 border border-border">
                      <AvatarImage src={avatarUrl} alt={profile?.displayName || 'Profile'} />
                      <AvatarFallback>{profile ? getInitials(profile.displayName) : <User className="w-4 h-4" />}</AvatarFallback>
                    </Avatar>
                    {profile && <span className="font-medium text-sm">{profile.displayName}</span>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {profile?.displayName}
                  </div>
                  <DropdownMenuSeparator />
                  <Link href="/profile/edit">
                    <DropdownMenuItem data-testid="button-edit-profile">
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit Profile
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive" data-testid="button-logout">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom Navigation - Always visible */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-border safe-area-bottom">
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
    </>
  );
}
