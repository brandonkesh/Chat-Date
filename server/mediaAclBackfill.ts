import { db } from "./db";
import { profiles, messages } from "@shared/schema";
import { isNotNull } from "drizzle-orm";

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [security] ${message}`);
}

/**
 * Re-ACL all existing user media objects from "public" to "private".
 *
 * Voice intros, intro videos, chat voice notes, and profile photos were
 * previously stored with visibility: "public", which allowed any authenticated
 * user who knew the raw object path to access the media regardless of their
 * current relationship with the owner. This function finds all such objects
 * and marks them private so that access is exclusively controlled by the
 * API-level proxy routes (/api/media/photo, /api/media/voice-intro,
 * /api/media/intro-video, /api/media/voice-note).
 *
 * This is a best-effort idempotent job: failures on individual objects are
 * logged and skipped so that one bad object cannot block the rest.
 */
export async function backfillMediaAcls(): Promise<void> {
  const { ObjectStorageService } = await import("./replit_integrations/object_storage");
  const { getObjectAclPolicy, setObjectAclPolicy } = await import(
    "./replit_integrations/object_storage/objectAcl"
  );

  const objectStorageService = new ObjectStorageService();
  let fixed = 0;
  let skipped = 0;

  async function makePrivate(objectPath: string, ownerId: string): Promise<void> {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const acl = await getObjectAclPolicy(objectFile);
      if (acl && acl.visibility === "public") {
        await setObjectAclPolicy(objectFile, { owner: ownerId, visibility: "private" });
        fixed++;
      }
    } catch (err: any) {
      log(`Skipped ${objectPath} (owner=${ownerId}): ${err?.message ?? err}`);
      skipped++;
    }
  }

  // Re-ACL profile photos
  const profilesWithPhoto = await db
    .select({ userId: profiles.userId, photoUrl: profiles.photoUrl })
    .from(profiles)
    .where(isNotNull(profiles.photoUrl));

  for (const p of profilesWithPhoto) {
    if (p.photoUrl && p.photoUrl.startsWith("/objects/")) {
      await makePrivate(p.photoUrl, p.userId);
    }
  }

  // Re-ACL profile voice intros
  const profilesWithVoiceIntro = await db
    .select({ userId: profiles.userId, voiceIntroUrl: profiles.voiceIntroUrl })
    .from(profiles)
    .where(isNotNull(profiles.voiceIntroUrl));

  for (const p of profilesWithVoiceIntro) {
    if (p.voiceIntroUrl) {
      await makePrivate(p.voiceIntroUrl, p.userId);
    }
  }

  // Re-ACL profile intro videos
  const profilesWithIntroVideo = await db
    .select({ userId: profiles.userId, introVideoUrl: profiles.introVideoUrl })
    .from(profiles)
    .where(isNotNull(profiles.introVideoUrl));

  for (const p of profilesWithIntroVideo) {
    if (p.introVideoUrl) {
      await makePrivate(p.introVideoUrl, p.userId);
    }
  }

  // Re-ACL chat voice notes
  const messagesWithVoiceNote = await db
    .select({ senderId: messages.senderId, voiceNoteUrl: messages.voiceNoteUrl })
    .from(messages)
    .where(isNotNull(messages.voiceNoteUrl));

  for (const m of messagesWithVoiceNote) {
    if (m.voiceNoteUrl) {
      await makePrivate(m.voiceNoteUrl, m.senderId);
    }
  }

  log(`Media ACL backfill complete: ${fixed} object(s) made private, ${skipped} skipped`);
}
