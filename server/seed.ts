import { db } from "./db";
import { users, profiles } from "@shared/schema";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  // Create fake users
  const fakeUsers = [
    {
      firstName: "Alice",
      lastName: "Chen",
      email: "alice@example.com",
      gender: "female",
      age: 24,
      bio: "Coffee addict and avid reader. Looking for someone to explore bookstores with.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice"
    },
    {
      firstName: "Marcus",
      lastName: "Johnson",
      email: "marcus@example.com",
      gender: "male",
      age: 28,
      bio: "Software engineer by day, musician by night. Let's grab tacos!",
      interestedIn: "female",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=marcus"
    },
    {
      firstName: "Sofia",
      lastName: "Rodriguez",
      email: "sofia@example.com",
      gender: "female",
      age: 26,
      bio: "Yoga instructor and plant mom. Looking for genuine connections.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=sofia"
    },
    {
      firstName: "James",
      lastName: "Williams",
      email: "james@example.com",
      gender: "male",
      age: 30,
      bio: "Chef who loves to travel. Best sushi in town? I'll find it.",
      interestedIn: "everyone",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=james"
    },
    {
      firstName: "Emma",
      lastName: "Thompson",
      email: "emma@example.com",
      gender: "female",
      age: 25,
      bio: "Marketing manager. Hiking enthusiast. Dog lover.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=emma"
    },
    {
      firstName: "David",
      lastName: "Kim",
      email: "david@example.com",
      gender: "male",
      age: 27,
      bio: "Photographer capturing life's moments. Always up for an adventure.",
      interestedIn: "female",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=david"
    },
    {
      firstName: "Olivia",
      lastName: "Martinez",
      email: "olivia@example.com",
      gender: "female",
      age: 23,
      bio: "Medical student. Love cooking Italian food and binge-watching shows.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=olivia"
    },
    {
      firstName: "Ryan",
      lastName: "Patel",
      email: "ryan@example.com",
      gender: "male",
      age: 29,
      bio: "Startup founder. Coffee meets bagel kind of person.",
      interestedIn: "female",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=ryan"
    },
    {
      firstName: "Mia",
      lastName: "Anderson",
      email: "mia@example.com",
      gender: "female",
      age: 24,
      bio: "Graphic designer with a passion for art galleries and live music.",
      interestedIn: "everyone",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=mia"
    },
    {
      firstName: "Ethan",
      lastName: "Brown",
      email: "ethan@example.com",
      gender: "male",
      age: 31,
      bio: "Lawyer who actually has free time. Tennis and wine enthusiast.",
      interestedIn: "female",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=ethan"
    },
    {
      firstName: "Ava",
      lastName: "Wilson",
      email: "ava@example.com",
      gender: "female",
      age: 27,
      bio: "Architect designing dreams. Salsa dancing on weekends.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=ava"
    },
    {
      firstName: "Noah",
      lastName: "Garcia",
      email: "noah@example.com",
      gender: "male",
      age: 26,
      bio: "Personal trainer. Beach volleyball and healthy smoothies are my thing.",
      interestedIn: "female",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=noah"
    },
    {
      firstName: "Isabella",
      lastName: "Lee",
      email: "isabella@example.com",
      gender: "female",
      age: 28,
      bio: "Fashion buyer traveling the world. Looking for my partner in crime.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=isabella"
    },
    {
      firstName: "Liam",
      lastName: "Taylor",
      email: "liam@example.com",
      gender: "male",
      age: 25,
      bio: "Data scientist who loves board games and craft beer.",
      interestedIn: "everyone",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=liam"
    },
    {
      firstName: "Zoe",
      lastName: "White",
      email: "zoe@example.com",
      gender: "female",
      age: 22,
      bio: "Psychology major. Cat person. Let's discuss philosophy over coffee.",
      interestedIn: "male",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=zoe"
    },
    {
      firstName: "Lucas",
      lastName: "Moore",
      email: "lucas@example.com",
      gender: "male",
      age: 32,
      bio: "Doctor with a love for jazz and weekend getaways.",
      interestedIn: "female",
      photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=lucas"
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
