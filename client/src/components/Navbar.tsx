import { Link, useLocation } from "wouter";
import { Flame, Heart, MessageCircle, Mail, CreditCard, LogOut, User, Pencil, Sparkles, SlidersHorizontal, Wand2, HelpCircle, Users, Bookmark, Mic, MessageSquarePlus, Inbox, RotateCcw, Shield, Award, LayoutGrid, HeartHandshake, Lightbulb, CalendarHeart, Palette, Dices, MoonStar, Trophy, Gift, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
  const isOwner = (profile as any)?.isOwner === true;

  if (location === "/" || location === "/onboarding") return null;

  const isActive = (path: string) => location === path ? "text-primary" : "text-muted-foreground hover:text-foreground";

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const avatarUrl = profile?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.displayName || 'user'}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 dark:bg-black/90 backdrop-blur-md border-t border-border md:top-0 md:bottom-auto md:border-t-0 md:border-b safe-area-bottom">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo - Hidden on mobile, shown on desktop */}
        <Link href="/feed" className="hidden md:flex items-center gap-2 font-display font-bold text-2xl hover:opacity-80 transition-opacity">
          <Flame className="fill-current w-6 h-6 text-accent" />
          <span className="text-primary">Crush</span>
        </Link>

        {/* Mobile & Desktop Nav Items */}
        <div className="flex flex-1 md:flex-none justify-around md:justify-end items-center md:gap-8">
          <Link href="/feed" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/feed')}`} data-testid="nav-discover">
            <Heart className={`w-6 h-6 ${location === '/feed' ? 'fill-current' : ''}`} />
            <span className="text-[10px] md:hidden font-medium">Discover</span>
          </Link>

          <Link href="/likes" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/likes')}`} data-testid="nav-likes">
            <Users className={`w-6 h-6`} />
            <span className="text-[10px] md:hidden font-medium">Likes</span>
          </Link>

          <Link href="/recommendations" className={`hidden md:flex flex-col items-center gap-1 transition-colors ${isActive('/recommendations')}`} data-testid="nav-recommendations">
            <Sparkles className={`w-6 h-6 ${location === '/recommendations' ? 'fill-current' : ''}`} />
            <span className="text-[10px] md:hidden font-medium">For You</span>
          </Link>

          <Link href="/matches" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/matches')}`} data-testid="nav-matches">
            <MessageCircle className={`w-6 h-6 ${location === '/matches' ? 'fill-current' : ''}`} />
            <span className="text-[10px] md:hidden font-medium">Matches</span>
          </Link>

          <Link href="/inbox" className={`flex flex-col items-center gap-1 transition-colors ${location.startsWith('/inbox') || location.startsWith('/chat') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} data-testid="nav-inbox">
            <Mail className={`w-6 h-6 ${location.startsWith('/inbox') || location.startsWith('/chat') ? 'fill-current' : ''}`} />
            <span className="text-[10px] md:hidden font-medium">Inbox</span>
          </Link>

          <Link href="/premium" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/premium')}`} data-testid="nav-premium">
            <CreditCard className={`w-6 h-6 ${location === '/premium' ? 'fill-current' : ''}`} />
            <span className="text-[10px] md:hidden font-medium">Premium</span>
          </Link>

          {/* Desktop Profile */}
          <div className="hidden md:flex items-center gap-4 border-l pl-8 border-border">
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
                <Link href="/ai-advisor">
                  <DropdownMenuItem data-testid="button-ai-advisor">
                    <Mic className="w-4 h-4 mr-2" />
                    AI Advisor
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <Link href="/profile/edit">
                  <DropdownMenuItem data-testid="button-edit-profile">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit Profile
                  </DropdownMenuItem>
                </Link>
                <Link href="/preferences">
                  <DropdownMenuItem data-testid="button-preferences">
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Preferences
                  </DropdownMenuItem>
                </Link>
                <Link href="/ai-matches">
                  <DropdownMenuItem data-testid="button-ai-matches">
                    <Wand2 className="w-4 h-4 mr-2" />
                    AI Matches
                  </DropdownMenuItem>
                </Link>
                <Link href="/second-chance">
                  <DropdownMenuItem data-testid="button-second-chance">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Second Chance
                  </DropdownMenuItem>
                </Link>
                <Link href="/date-checkin">
                  <DropdownMenuItem data-testid="button-date-checkin">
                    <Shield className="w-4 h-4 mr-2" />
                    Date Check-In
                  </DropdownMenuItem>
                </Link>
                <Link href="/personality-quiz">
                  <DropdownMenuItem data-testid="button-personality-quiz">
                    <Award className="w-4 h-4 mr-2" />
                    Personality Quiz
                  </DropdownMenuItem>
                </Link>
                <Link href="/date-bingo">
                  <DropdownMenuItem data-testid="button-date-bingo">
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    First Date Bingo
                  </DropdownMenuItem>
                </Link>
                <Link href="/success-stories">
                  <DropdownMenuItem data-testid="button-success-stories">
                    <HeartHandshake className="w-4 h-4 mr-2" />
                    Success Stories
                  </DropdownMenuItem>
                </Link>
                <Link href="/tips">
                  <DropdownMenuItem data-testid="button-dating-tips">
                    <Lightbulb className="w-4 h-4 mr-2" />
                    Dating Tips
                  </DropdownMenuItem>
                </Link>
                <Link href="/weekly-club">
                  <DropdownMenuItem data-testid="button-weekly-club">
                    <CalendarHeart className="w-4 h-4 mr-2" />
                    Weekly Club
                  </DropdownMenuItem>
                </Link>
                <Link href="/dream-date">
                  <DropdownMenuItem data-testid="button-dream-date">
                    <Palette className="w-4 h-4 mr-2" />
                    Dream Date
                  </DropdownMenuItem>
                </Link>
                <Link href="/blind-roulette">
                  <DropdownMenuItem data-testid="button-blind-roulette">
                    <Dices className="w-4 h-4 mr-2" />
                    Blind Date Roulette
                  </DropdownMenuItem>
                </Link>
                <Link href="/horoscope">
                  <DropdownMenuItem data-testid="button-horoscope">
                    <MoonStar className="w-4 h-4 mr-2" />
                    Love Horoscope
                  </DropdownMenuItem>
                </Link>
                <Link href="/leaderboard">
                  <DropdownMenuItem data-testid="button-leaderboard">
                    <Trophy className="w-4 h-4 mr-2" />
                    Leaderboard
                  </DropdownMenuItem>
                </Link>
                <Link href="/invite">
                  <DropdownMenuItem data-testid="button-invite">
                    <Gift className="w-4 h-4 mr-2" />
                    Invite Friends
                  </DropdownMenuItem>
                </Link>
                <Link href="/help">
                  <DropdownMenuItem data-testid="button-help">
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Help & Support
                  </DropdownMenuItem>
                </Link>
                <Link href="/feedback">
                  <DropdownMenuItem data-testid="button-feedback">
                    <MessageSquarePlus className="w-4 h-4 mr-2" />
                    Send Feedback
                  </DropdownMenuItem>
                </Link>
                {isOwner && (
                  <>
                    <Link href="/admin/dashboard">
                      <DropdownMenuItem data-testid="button-owner-dashboard">
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Owner Dashboard
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/feedback">
                      <DropdownMenuItem data-testid="button-admin-feedback">
                        <Inbox className="w-4 h-4 mr-2" />
                        View Feedback
                      </DropdownMenuItem>
                    </Link>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive" data-testid="button-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="md:hidden flex flex-col items-center gap-1 text-muted-foreground" data-testid="button-profile-menu-mobile">
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
              <Link href="/ai-advisor">
                <DropdownMenuItem data-testid="button-ai-advisor-mobile">
                  <Mic className="w-4 h-4 mr-2" />
                  AI Advisor
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <Link href="/profile/edit">
                <DropdownMenuItem data-testid="button-edit-profile-mobile">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Profile
                </DropdownMenuItem>
              </Link>
              <Link href="/preferences">
                <DropdownMenuItem data-testid="button-preferences-mobile">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Preferences
                </DropdownMenuItem>
              </Link>
              <Link href="/recommendations">
                <DropdownMenuItem data-testid="button-recommendations-mobile">
                  <Sparkles className="w-4 h-4 mr-2" />
                  For You
                </DropdownMenuItem>
              </Link>
              <Link href="/saved">
                <DropdownMenuItem data-testid="button-saved-profiles-mobile">
                  <Bookmark className="w-4 h-4 mr-2" />
                  Saved Profiles
                </DropdownMenuItem>
              </Link>
              <Link href="/ai-matches">
                <DropdownMenuItem data-testid="button-ai-matches-mobile">
                  <Wand2 className="w-4 h-4 mr-2" />
                  AI Matches
                </DropdownMenuItem>
              </Link>
              <Link href="/second-chance">
                <DropdownMenuItem data-testid="button-second-chance-mobile">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Second Chance
                </DropdownMenuItem>
              </Link>
              <Link href="/date-checkin">
                <DropdownMenuItem data-testid="button-date-checkin-mobile">
                  <Shield className="w-4 h-4 mr-2" />
                  Date Check-In
                </DropdownMenuItem>
              </Link>
              <Link href="/personality-quiz">
                <DropdownMenuItem data-testid="button-personality-quiz-mobile">
                  <Award className="w-4 h-4 mr-2" />
                  Personality Quiz
                </DropdownMenuItem>
              </Link>
              <Link href="/date-bingo">
                <DropdownMenuItem data-testid="button-date-bingo-mobile">
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  First Date Bingo
                </DropdownMenuItem>
              </Link>
              <Link href="/success-stories">
                <DropdownMenuItem data-testid="button-success-stories-mobile">
                  <HeartHandshake className="w-4 h-4 mr-2" />
                  Success Stories
                </DropdownMenuItem>
              </Link>
              <Link href="/tips">
                <DropdownMenuItem data-testid="button-dating-tips-mobile">
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Dating Tips
                </DropdownMenuItem>
              </Link>
              <Link href="/weekly-club">
                <DropdownMenuItem data-testid="button-weekly-club-mobile">
                  <CalendarHeart className="w-4 h-4 mr-2" />
                  Weekly Club
                </DropdownMenuItem>
              </Link>
              <Link href="/dream-date">
                <DropdownMenuItem data-testid="button-dream-date-mobile">
                  <Palette className="w-4 h-4 mr-2" />
                  Dream Date
                </DropdownMenuItem>
              </Link>
              <Link href="/blind-roulette">
                <DropdownMenuItem data-testid="button-blind-roulette-mobile">
                  <Dices className="w-4 h-4 mr-2" />
                  Blind Date Roulette
                </DropdownMenuItem>
              </Link>
              <Link href="/horoscope">
                <DropdownMenuItem data-testid="button-horoscope-mobile">
                  <MoonStar className="w-4 h-4 mr-2" />
                  Love Horoscope
                </DropdownMenuItem>
              </Link>
              <Link href="/leaderboard">
                <DropdownMenuItem data-testid="button-leaderboard-mobile">
                  <Trophy className="w-4 h-4 mr-2" />
                  Leaderboard
                </DropdownMenuItem>
              </Link>
              <Link href="/invite">
                <DropdownMenuItem data-testid="button-invite-mobile">
                  <Gift className="w-4 h-4 mr-2" />
                  Invite Friends
                </DropdownMenuItem>
              </Link>
              <Link href="/help">
                <DropdownMenuItem data-testid="button-help-mobile">
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Help & Support
                </DropdownMenuItem>
              </Link>
              <Link href="/feedback">
                <DropdownMenuItem data-testid="button-feedback-mobile">
                  <MessageSquarePlus className="w-4 h-4 mr-2" />
                  Send Feedback
                </DropdownMenuItem>
              </Link>
              {isOwner && (
                <>
                  <Link href="/admin/dashboard">
                    <DropdownMenuItem data-testid="button-owner-dashboard-mobile">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Owner Dashboard
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/admin/feedback">
                    <DropdownMenuItem data-testid="button-admin-feedback-mobile">
                      <Inbox className="w-4 h-4 mr-2" />
                      View Feedback
                    </DropdownMenuItem>
                  </Link>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive" data-testid="button-logout-mobile">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
