import { db } from "./db";
import { users, profiles } from "@shared/schema";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  // Create fake users
  const fakeUsers = [
    {
      username: "alice_wonder",
      firstName: "Alice",
      lastName: "Wonderland",
      email: "alice@example.com",
      gender: "female",
      age: 24,
      bio: "Looking for my white rabbit. 🐰 Love hiking and tea parties.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice"
    },
    {
      username: "bob_builder",
      firstName: "Bob",
      lastName: "Builder",
      email: "bob@example.com",
      gender: "male",
      age: 28,
      bio: "Can we fix it? Yes we can! 🛠️",
      interestedIn: "female",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob"
    },
    {
      username: "charlie_chef",
      firstName: "Charlie",
      lastName: "Chef",
      email: "charlie@example.com",
      gender: "male",
      age: 30,
      bio: "Cooking up a storm. 🍳 Pizza lover.",
      interestedIn: "everyone",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=charlie"
    },
    {
      username: "diana_dreamer",
      firstName: "Diana",
      lastName: "Dreamer",
      email: "diana@example.com",
      gender: "female",
      age: 22,
      bio: "Dream big, sparkle more, shine bright. ✨",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=diana"
    }
  ];

  for (const user of fakeUsers) {
    // 1. Insert into users (auth table)
    const [insertedUser] = await db.insert(users).values({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    }).onConflictDoNothing().returning();
    
    // If we didn't insert (conflict), try to find existing to get ID
    let userId = insertedUser?.id;
    if (!userId) {
       // Just skip if exists for now or find it
       // Simplified: assume we are seeding fresh or names are unique enough
       continue;
    }

    // 2. Insert into profiles
    const trialEndsAt = new Date();
    trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);

    await db.insert(profiles).values({
      userId,
      displayName: `${user.firstName} ${user.lastName}`,
      bio: user.bio,
      age: user.age,
      gender: user.gender,
      interestedIn: user.interestedIn,
      photoUrl: user.photoUrl,
      trialEndsAt,
    }).onConflictDoNothing();
  }

  console.log("Seeding complete!");
}

seed().catch(console.error);
