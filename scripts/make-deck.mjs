import PptxGenJS from "pptxgenjs";

const BLUE = "2E7CF6";
const DARKBLUE = "1E3A8A";
const ORANGE = "F97316";
const DARK = "1E2733";
const GRAY = "5B6B7C";
const LIGHT = "F4F6F9";
const WHITE = "FFFFFF";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_16x9";
pptx.author = "Crush";
pptx.title = "Crush — Find your Crush without the wait";

pptx.defineSlideMaster({
  title: "MAIN",
  background: { color: WHITE },
  objects: [
    { rect: { x: 0, y: 5.35, w: "100%", h: 0.28, fill: { color: BLUE } } },
    { text: { text: "crushmatchup.com", options: { x: 8.1, y: 5.33, w: 1.8, h: 0.3, fontSize: 9, color: WHITE, align: "right", fontFace: "Arial" } } },
  ],
});

function titleBar(slide, emoji, title, subtitle) {
  slide.addText(`${emoji} ${title}`, { x: 0.5, y: 0.32, w: 9, h: 0.6, fontSize: 30, bold: true, color: DARK, fontFace: "Arial" });
  if (subtitle) slide.addText(subtitle, { x: 0.52, y: 0.92, w: 9, h: 0.35, fontSize: 14, color: GRAY, fontFace: "Arial" });
}

function bulletCard(slide, x, y, w, h, header, items, headerColor = BLUE) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, fill: { color: LIGHT }, line: { color: "E1E6ED", width: 1 } });
  slide.addText(header, { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.35, fontSize: 15, bold: true, color: headerColor, fontFace: "Arial" });
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: { code: "2022" }, fontSize: 11.5, color: DARK, breakLine: true, paraSpaceAfter: 4 } })),
    { x: x + 0.18, y: y + 0.5, w: w - 0.35, h: h - 0.6, fontFace: "Arial", valign: "top" }
  );
}

// ---------- Slide 1: Title ----------
let s = pptx.addSlide();
s.background = { color: DARKBLUE };
s.addShape("rect", { x: 0, y: 0, w: "100%", h: "100%", fill: { type: "solid", color: DARKBLUE } });
s.addText("🔥", { x: 4.25, y: 0.8, w: 1.5, h: 1, fontSize: 54, align: "center" });
s.addText("Crush", { x: 1, y: 1.7, w: 8, h: 1, fontSize: 60, bold: true, color: WHITE, align: "center", fontFace: "Arial" });
s.addText("Find your Crush without the wait.", { x: 1, y: 2.75, w: 8, h: 0.6, fontSize: 24, color: "BFDBFE", align: "center", italic: true, fontFace: "Arial" });
s.addText("The modern dating app that puts conversation first", { x: 1, y: 3.4, w: 8, h: 0.4, fontSize: 16, color: WHITE, align: "center", fontFace: "Arial" });
s.addShape("roundRect", { x: 3.4, y: 4.1, w: 3.2, h: 0.55, rectRadius: 0.27, fill: { color: ORANGE } });
s.addText("crushmatchup.com", { x: 3.4, y: 4.1, w: 3.2, h: 0.55, fontSize: 16, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Arial" });

// ---------- Slide 2: What is Crush ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "💙", "What is Crush?", "A dating app built around real connection — not endless waiting.");
bulletCard(s, 0.5, 1.45, 4.4, 3.6, "The Experience", [
  "Tinder-style swiping that's fast and fun",
  "Smart compatibility matching — interests, lifestyle, goals & location",
  "Real-time chat with games, voice notes & video calls",
  "AI tools that coach you every step of the way",
  "Safety-first design: verification, scam detection & privacy controls",
]);
bulletCard(s, 5.1, 1.45, 4.4, 3.6, "Why People Love It", [
  "30-day FREE trial of premium chat — no credit card needed",
  "Conversation-first: features designed to break the ice",
  "Fresh content every week (questions, tips & challenges)",
  "Daily rewards that make checking in fun",
  "Works beautifully on phone, tablet & desktop",
], ORANGE);

// ---------- Slide 3: Core features ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "✨", "Core Features", "Everything you need to meet someone great.");
bulletCard(s, 0.5, 1.45, 3.05, 3.6, "Discover", [
  "Swipe to like or pass",
  "Smart match scoring",
  "Top Picks & recommendations",
  "Advanced search filters",
  "Profile boosts to get seen first",
  "Second Chance — rewind a pass",
  "Save profiles for later",
]);
bulletCard(s, 3.72, 1.45, 3.05, 3.6, "Connect", [
  "Real-time messaging",
  "Voice notes & voice intros",
  "Intro videos on profiles",
  "Video calls (WebRTC)",
  "Micro-Dates — 5-minute virtual dates",
  "Icebreakers & conversation starters",
  "Read receipts",
], ORANGE);
bulletCard(s, 6.94, 1.45, 3.05, 3.6, "Stand Out", [
  "Photo verification badge",
  "Personality badges",
  "Song of the Day on your profile",
  "Profile prompts & fun answers",
  "Question of the Week",
  "VIP badge (Elite)",
  "See who viewed & liked you",
], DARKBLUE);

// ---------- Slide 4: AI features ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "🤖", "AI-Powered Dating Tools", "Your personal dating coach, built right in.");
bulletCard(s, 0.5, 1.45, 4.4, 3.6, "Coaching & Advice", [
  "AI Dating Advisor — chat by voice or text for ideas & advice",
  "AI Conversation Coach — never run out of things to say",
  "AI Profile Optimizer — make your profile shine",
  "Weekly AI Dating Tips — fresh advice every week",
  "AI Date Idea Generator — personalized date suggestions in chat",
]);
bulletCard(s, 5.1, 1.45, 4.4, 3.6, "Smart & Safe", [
  "AI Scam Detector — real-time warnings on suspicious messages",
  "AI Photo Match — find compatible looks (Pro & Elite)",
  "Compatibility scoring across interests, lifestyle & goals",
  "Smart matchmaking with zip-code proximity",
], ORANGE);

// ---------- Slide 5: Games & fun ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "🎮", "Games & Fun", "Breaking the ice has never been easier.");
bulletCard(s, 0.5, 1.45, 4.4, 3.6, "Chat Games", [
  "Two Truths and a Lie — guess which is the fib",
  "Emoji Story — tell a story in emojis only",
  "Would You Rather — quick-fire fun questions",
  "AI Date Ideas — pick one together right in chat",
]);
bulletCard(s, 5.1, 1.45, 4.4, 3.6, "Challenges & Quizzes", [
  "Personality Quiz — earn badges for your profile",
  "First Date Bingo — playful first-date checklist",
  "Question of the Week — a new question every week",
  "Song of the Day — share your soundtrack",
], ORANGE);

// ---------- Slide 6: Stay connected ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "💞", "Staying Connected", "Little nudges that keep the spark alive.");
bulletCard(s, 0.5, 1.45, 4.4, 3.6, "Momentum", [
  "Daily login rewards — build a streak, earn extra Top Picks",
  "\"Your turn\" reminders when a match is waiting on you",
  "Expiring-match nudges before a connection goes cold",
  "Anniversary reminders — celebrate 1 week, 1 month & beyond",
]);
bulletCard(s, 5.1, 1.45, 4.4, 3.6, "After the Date", [
  "Date check-ins with a trusted-contact safety option",
  "Post-date feedback — rate how it went",
  "Success Stories — share & get inspired by real couples",
], ORANGE);

// ---------- Slide 7: Safety ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "🛡️", "Safety & Trust", "Dating should feel safe. We make sure it does.");
bulletCard(s, 0.5, 1.45, 3.05, 3.6, "Verified People", [
  "Photo verification with badge",
  "Age verification indicators",
  "VIP & trust badges",
]);
bulletCard(s, 3.72, 1.45, 3.05, 3.6, "Protected Chats", [
  "AI scam detection in real time",
  "Block & report anyone instantly",
  "Bidirectional blocking enforced",
], ORANGE);
bulletCard(s, 6.94, 1.45, 3.05, 3.6, "Private Account", [
  "Optional app lock password",
  "Two-factor authentication (2FA)",
  "Incognito browsing (Elite)",
  "Secure login with trusted sign-in",
], DARKBLUE);

// ---------- Slide 8: Pricing ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "💎", "Membership Plans", "Start with a 30-day FREE trial of premium chat — then pick your plan.");

function tierCard(x, name, price, tagline, items, color, popular) {
  s.addShape("roundRect", { x, y: 1.5, w: 3.05, h: 3.55, rectRadius: 0.08, fill: { color: LIGHT }, line: { color: popular ? ORANGE : "E1E6ED", width: popular ? 2.5 : 1 } });
  if (popular) {
    s.addShape("roundRect", { x: x + 0.75, y: 1.36, w: 1.55, h: 0.28, rectRadius: 0.14, fill: { color: ORANGE } });
    s.addText("MOST POPULAR", { x: x + 0.75, y: 1.36, w: 1.55, h: 0.28, fontSize: 8.5, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Arial" });
  }
  s.addText(name, { x: x + 0.15, y: 1.72, w: 2.75, h: 0.35, fontSize: 18, bold: true, color, fontFace: "Arial" });
  s.addText([
    { text: `$${price}`, options: { fontSize: 24, bold: true, color: DARK } },
    { text: " / month", options: { fontSize: 11, color: GRAY } },
  ], { x: x + 0.15, y: 2.05, w: 2.75, h: 0.4, fontFace: "Arial" });
  s.addText(tagline, { x: x + 0.15, y: 2.44, w: 2.75, h: 0.28, fontSize: 10.5, italic: true, color: GRAY, fontFace: "Arial" });
  s.addText(
    items.map((t) => ({ text: t, options: { bullet: { code: "2022" }, fontSize: 9.8, color: DARK, breakLine: true, paraSpaceAfter: 2 } })),
    { x: x + 0.18, y: 2.75, w: 2.75, h: 2.2, fontFace: "Arial", valign: "top" }
  );
}

tierCard(0.5, "Basic", "4.99", "Start meeting people", [
  "Unlimited daily likes",
  "10 super likes per day",
  "See who viewed your profile",
  "Basic search filters",
  "Ad-free experience",
  "Save profiles for later",
  "AI chat advisor",
  "1 profile boost / month",
], BLUE);

tierCard(3.72, "Pro", "9.99", "Maximize your matches", [
  "Everything in Basic, plus:",
  "Unlimited super likes",
  "See everyone who likes you",
  "Priority matching algorithm",
  "Advanced filters (age, distance, lifestyle)",
  "Read receipts",
  "Voice & video calls",
  "AI photo match",
  "3 profile boosts / month",
], ORANGE, true);

tierCard(6.94, "Elite", "19.99", "The complete experience", [
  "Everything in Pro, plus:",
  "Weekly profile boost (4 / month)",
  "Incognito mode — browse privately",
  "VIP badge on your profile",
  "AI profile optimizer",
  "Priority customer support",
  "Exclusive member events",
], DARKBLUE);

// ---------- Slide 9: Plan comparison ----------
s = pptx.addSlide({ masterName: "MAIN" });
titleBar(s, "📊", "Compare Plans at a Glance");
const th = { bold: true, color: WHITE, fill: { color: BLUE }, fontSize: 12, align: "center", valign: "middle", fontFace: "Arial" };
const td = { color: DARK, fontSize: 11.5, align: "center", valign: "middle", fontFace: "Arial" };
const tl = { ...td, align: "left", bold: true };
s.addTable(
  [
    [{ text: "", options: th }, { text: "Free Trial", options: th }, { text: "Basic — $4.99", options: th }, { text: "Pro — $9.99", options: { ...th, fill: { color: ORANGE } } }, { text: "Elite — $19.99", options: th }],
    [{ text: "Daily likes", options: tl }, { text: "Limited", options: td }, { text: "Unlimited", options: td }, { text: "Unlimited", options: td }, { text: "Unlimited", options: td }],
    [{ text: "Super likes / day", options: tl }, { text: "—", options: td }, { text: "10", options: td }, { text: "Unlimited", options: td }, { text: "Unlimited", options: td }],
    [{ text: "Profile boosts / month", options: tl }, { text: "—", options: td }, { text: "1", options: td }, { text: "3", options: td }, { text: "4 (weekly)", options: td }],
    [{ text: "Message history", options: tl }, { text: "30 days", options: td }, { text: "30 days", options: td }, { text: "Unlimited", options: td }, { text: "Unlimited", options: td }],
    [{ text: "See who likes you", options: tl }, { text: "—", options: td }, { text: "Viewers only", options: td }, { text: "✓ Everyone", options: td }, { text: "✓ Everyone", options: td }],
    [{ text: "Voice & video calls", options: tl }, { text: "—", options: td }, { text: "—", options: td }, { text: "✓", options: td }, { text: "✓", options: td }],
    [{ text: "Incognito + VIP badge", options: tl }, { text: "—", options: td }, { text: "—", options: td }, { text: "—", options: td }, { text: "✓", options: td }],
  ],
  { x: 0.5, y: 1.35, w: 9.0, rowH: 0.42, border: { pt: 0.75, color: "D7DEE7" } }
);
s.addText("Every new member gets 30 days of premium chat FREE — no credit card required.", { x: 0.5, y: 4.95, w: 9, h: 0.3, fontSize: 12, italic: true, color: GRAY, align: "center", fontFace: "Arial" });

// ---------- Slide 10: Closing ----------
s = pptx.addSlide();
s.background = { color: DARKBLUE };
s.addText("🔥", { x: 4.25, y: 0.9, w: 1.5, h: 0.9, fontSize: 48, align: "center" });
s.addText("Ready to find your Crush?", { x: 1, y: 1.85, w: 8, h: 0.8, fontSize: 40, bold: true, color: WHITE, align: "center", fontFace: "Arial" });
s.addText("Join free today — your first month of premium chat is on us.", { x: 1, y: 2.75, w: 8, h: 0.5, fontSize: 18, color: "BFDBFE", align: "center", fontFace: "Arial" });
s.addShape("roundRect", { x: 3.3, y: 3.5, w: 3.4, h: 0.6, rectRadius: 0.3, fill: { color: ORANGE } });
s.addText("crushmatchup.com", { x: 3.3, y: 3.5, w: 3.4, h: 0.6, fontSize: 18, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Arial" });
s.addText("No credit card required  •  Cancel anytime", { x: 1, y: 4.35, w: 8, h: 0.35, fontSize: 12, color: "93A8C9", align: "center", fontFace: "Arial" });

await pptx.writeFile({ fileName: "exports/Crush-Dating-App.pptx" });
console.log("Deck written to exports/Crush-Dating-App.pptx");
