import { Button } from "@/components/ui/button";
import { Heart, MessageCircle, ShieldCheck } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 font-display font-bold text-2xl text-primary">
          <Heart className="fill-current w-7 h-7" />
          <span>Crush</span>
        </div>
        <Button 
          variant="ghost" 
          className="font-semibold text-foreground hover:text-primary"
          onClick={() => window.location.href = "/api/login"}
        >
          Login
        </Button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-12">
        <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Try Premium Chat Free for 1 Month
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight text-foreground leading-[1.1]">
            Find your <span className="text-primary italic">Crush</span> <br/>
            without the wait.
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            The modern dating app that puts conversation first. Start your 30-day free trial today and connect with people nearby instantly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              size="lg" 
              className="w-full sm:w-auto text-lg h-14 px-8 rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 transition-all hover:-translate-y-1"
              onClick={() => window.location.href = "/api/login"}
            >
              Start Dating Now
            </Button>
            <span className="text-sm text-muted-foreground">No credit card required</span>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-6xl w-full">
          {[
            { 
              icon: Heart, 
              title: "Meaningful Matches", 
              desc: "Our algorithm connects you with people who share your vibe." 
            },
            { 
              icon: MessageCircle, 
              title: "Free Premium Chat", 
              desc: "Talk freely for 30 days. No paywalls blocking your first hello." 
            },
            { 
              icon: ShieldCheck, 
              title: "Verified Profiles", 
              desc: "Safety first. We ensure you're talking to real people." 
            }
          ].map((feature, i) => (
            <div key={i} className="p-6 rounded-3xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Crush Dating. All rights reserved.
      </footer>
    </div>
  );
}
