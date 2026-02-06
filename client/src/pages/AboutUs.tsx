import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, Shield, Sparkles, Users, Globe, Lock } from "lucide-react";
import { useLocation } from "wouter";

export default function AboutUs() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-secondary/30 pb-24 md:pt-20">
      <div className="max-w-2xl mx-auto p-4">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => setLocation("/preferences")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold" data-testid="heading-about">About Crush</h1>
          <p className="text-muted-foreground mt-2">Where real connections begin</p>
        </div>

        <Card className="mb-4" data-testid="card-mission">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-primary" />
              Our Mission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Crush was built with a simple idea: dating should feel natural, safe, and fun. We believe everyone
              deserves meaningful connections, and we're here to help you find them. Our platform combines
              thoughtful design with smart matching to bring people together in an authentic way.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4" data-testid="card-how-it-works">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="w-5 h-5 text-primary" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div>
                <p className="font-medium text-sm">Create Your Profile</p>
                <p className="text-sm text-muted-foreground">Share your interests, photos, and what makes you unique.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div>
                <p className="font-medium text-sm">Discover People</p>
                <p className="text-sm text-muted-foreground">Swipe through profiles, explore recommendations, and find people who share your vibe.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-sm font-bold text-primary">3</span>
              </div>
              <div>
                <p className="font-medium text-sm">Match & Connect</p>
                <p className="text-sm text-muted-foreground">When the feeling is mutual, start chatting and get to know each other better.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4" data-testid="card-values">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="w-5 h-5 text-primary" />
              What We Stand For
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Safety First</p>
                <p className="text-sm text-muted-foreground">Profile verification, reporting tools, and a dedicated safety team to keep our community secure.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Inclusive Community</p>
                <p className="text-sm text-muted-foreground">Crush welcomes everyone. We celebrate diversity and are committed to creating a space where all people feel valued.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-violet-500 dark:text-violet-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Your Privacy Matters</p>
                <p className="text-sm text-muted-foreground">Your data is yours. We use industry-standard encryption and never sell your personal information.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Made with love by the Crush team.
        </p>
      </div>
    </div>
  );
}
