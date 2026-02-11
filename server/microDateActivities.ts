import type { MicroDateActivity } from "@shared/schema";

const icebreakers: MicroDateActivity[] = [
  { type: "icebreaker", prompt: "What's your go-to comfort food after a long day?", timeLimit: 30 },
  { type: "icebreaker", prompt: "If you could wake up tomorrow anywhere in the world, where would it be?", timeLimit: 30 },
  { type: "icebreaker", prompt: "What's the most spontaneous thing you've ever done?", timeLimit: 30 },
  { type: "icebreaker", prompt: "What song always puts you in a good mood?", timeLimit: 30 },
  { type: "icebreaker", prompt: "What's a skill you'd love to learn but haven't yet?", timeLimit: 30 },
  { type: "icebreaker", prompt: "What's the best advice someone has ever given you?", timeLimit: 30 },
  { type: "icebreaker", prompt: "If you could have dinner with anyone, living or not, who would it be?", timeLimit: 30 },
  { type: "icebreaker", prompt: "What's something that always makes you laugh?", timeLimit: 30 },
  { type: "icebreaker", prompt: "What's a hidden talent most people don't know about you?", timeLimit: 30 },
  { type: "icebreaker", prompt: "If your life had a theme song, what would it be?", timeLimit: 30 },
];

const wouldYouRather: MicroDateActivity[] = [
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Travel back in time", "Travel to the future"], timeLimit: 20 },
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Always be overdressed", "Always be underdressed"], timeLimit: 20 },
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Have a personal chef", "Have a personal masseuse"], timeLimit: 20 },
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Live in a big city penthouse", "Live on a quiet beach house"], timeLimit: 20 },
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Be able to fly", "Be able to read minds"], timeLimit: 20 },
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Never use social media again", "Never watch TV again"], timeLimit: 20 },
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Always be 10 minutes early", "Always be fashionably late"], timeLimit: 20 },
  { type: "would_you_rather", prompt: "Would you rather...", options: ["Have unlimited travel", "Have unlimited concert tickets"], timeLimit: 20 },
];

const thisOrThat: MicroDateActivity[] = [
  { type: "this_or_that", prompt: "Pick one:", options: ["Morning person", "Night owl"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Sweet", "Savory"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Mountains", "Beach"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Netflix binge", "Outdoor adventure"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Text first", "Call first"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Road trip", "Plane ride"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Cook at home", "Eat out"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Summer vibes", "Winter cozy"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Cat person", "Dog person"], timeLimit: 15 },
  { type: "this_or_that", prompt: "Pick one:", options: ["Early bird", "Sleep in"], timeLimit: 15 },
];

const rapidFire: MicroDateActivity[] = [
  { type: "rapid_fire", prompt: "Guilty pleasure TV show?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Favorite pizza topping?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Last thing that made you laugh out loud?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Ideal first date?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Most-used emoji?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Dream vacation destination?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Worst date you've been on?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Biggest pet peeve?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "Favorite way to spend a Sunday?", timeLimit: 15 },
  { type: "rapid_fire", prompt: "One thing on your bucket list?", timeLimit: 15 },
];

const hotTakes: MicroDateActivity[] = [
  { type: "hot_take", prompt: "Hot take: Pineapple on pizza is...", options: ["Delicious", "A crime"], timeLimit: 20 },
  { type: "hot_take", prompt: "Hot take: The best meal of the day is...", options: ["Breakfast", "Dinner"], timeLimit: 20 },
  { type: "hot_take", prompt: "Hot take: Texting back immediately is...", options: ["Sweet and attentive", "A bit much"], timeLimit: 20 },
  { type: "hot_take", prompt: "Hot take: Long-distance relationships...", options: ["Can totally work", "Are too hard"], timeLimit: 20 },
  { type: "hot_take", prompt: "Hot take: Meeting through apps vs. in person...", options: ["Apps are great", "In-person is better"], timeLimit: 20 },
  { type: "hot_take", prompt: "Hot take: Sleeping with socks on is...", options: ["Cozy and normal", "Absolutely not"], timeLimit: 20 },
];

const wordAssociation: MicroDateActivity[] = [
  { type: "word_association", prompt: "First word that comes to mind: Adventure", timeLimit: 10 },
  { type: "word_association", prompt: "First word that comes to mind: Love", timeLimit: 10 },
  { type: "word_association", prompt: "First word that comes to mind: Home", timeLimit: 10 },
  { type: "word_association", prompt: "First word that comes to mind: Friday night", timeLimit: 10 },
  { type: "word_association", prompt: "First word that comes to mind: Dream", timeLimit: 10 },
  { type: "word_association", prompt: "First word that comes to mind: Happiness", timeLimit: 10 },
];

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateMicroDateLineup(): MicroDateActivity[] {
  const lineup: MicroDateActivity[] = [];

  const shuffledIcebreakers = shuffleArray(icebreakers);
  lineup.push(shuffledIcebreakers[0], shuffledIcebreakers[1]);

  const shuffledThisOrThat = shuffleArray(thisOrThat);
  lineup.push(shuffledThisOrThat[0], shuffledThisOrThat[1]);

  const shuffledWYR = shuffleArray(wouldYouRather);
  lineup.push(shuffledWYR[0]);

  const shuffledRapidFire = shuffleArray(rapidFire);
  lineup.push(shuffledRapidFire[0], shuffledRapidFire[1], shuffledRapidFire[2]);

  const shuffledHotTakes = shuffleArray(hotTakes);
  lineup.push(shuffledHotTakes[0]);

  const shuffledWordAssoc = shuffleArray(wordAssociation);
  lineup.push(shuffledWordAssoc[0]);

  return lineup;
}
