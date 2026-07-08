// Weekly "Question of the Week" — rotates automatically by ISO week.
// The profile stores { weeklyQuestionKey, weeklyAnswer }; an answer only
// shows on cards while its week key matches the current week.

export const WEEKLY_QUESTIONS: { key: string; question: string }[] = [
  { key: "perfect-sunday", question: "What does your perfect Sunday look like?" },
  { key: "dream-trip", question: "Where would you go if you could travel anywhere tomorrow?" },
  { key: "comfort-food", question: "What's your ultimate comfort food?" },
  { key: "hidden-talent", question: "What's a hidden talent of yours?" },
  { key: "song-repeat", question: "What song have you had on repeat lately?" },
  { key: "small-joy", question: "What's a small thing that always makes your day?" },
  { key: "dinner-guest", question: "If you could have dinner with anyone, who would it be?" },
  { key: "unpopular-opinion", question: "What's your most harmless unpopular opinion?" },
  { key: "ideal-date", question: "Describe your ideal first date in one sentence." },
  { key: "childhood-dream", question: "What did you want to be when you were a kid?" },
  { key: "guilty-pleasure", question: "What's your guilty pleasure show or movie?" },
  { key: "superpower", question: "If you had one superpower, what would it be?" },
];

// ISO week key like "2026-W28" — must stay consistent week to week.
export function currentWeekKey(): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Deterministic pick: same question for everyone during a given week.
export function currentWeeklyQuestion(): { key: string; question: string } {
  const weekKey = currentWeekKey();
  let hash = 0;
  for (let i = 0; i < weekKey.length; i++) {
    hash = (hash * 31 + weekKey.charCodeAt(i)) >>> 0;
  }
  return WEEKLY_QUESTIONS[hash % WEEKLY_QUESTIONS.length];
}

// Personality badge catalog (used by quiz + profile display)
export const PERSONALITY_BADGES: Record<string, { emoji: string; label: string }> = {
  adventurer: { emoji: "🌍", label: "Adventurer" },
  homebody: { emoji: "🏠", label: "Homebody" },
  foodie: { emoji: "🍜", label: "Foodie" },
  creative: { emoji: "🎨", label: "Creative" },
  bookworm: { emoji: "📚", label: "Bookworm" },
  fitness_fan: { emoji: "💪", label: "Fitness Fan" },
  music_lover: { emoji: "🎵", label: "Music Lover" },
  comedian: { emoji: "😂", label: "Comedian" },
  romantic: { emoji: "💘", label: "Hopeless Romantic" },
  planner: { emoji: "🗓️", label: "The Planner" },
};
