import { db } from "./db";
import { profiles, messages } from "@shared/schema";
import { isNotNull } from "drizzle-orm";

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [security] ${message}`);
}

// Orphans younger than this are kept: a legitimate user may still be between
// "upload finished" and "bind to profile/message" for a short while.
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// No legitimate app upload exceeds this (largest allowed is a 50MB intro
// video). Unbound blobs over the cap are deleted immediately regardless of
// age, so oversized dumps can't sit in the bucket for a day.
const ORPHAN_HARD_SIZE_CAP_BYTES = 50 * 1024 * 1024;

/**
 * Remove orphaned objects from the private uploads area.
 *
 * The signed upload URL cannot enforce size or type limits, so an attacker
 * can PUT arbitrary blobs after requesting an upload URL. Real media becomes
 * "bound" when a binding endpoint validates it and records it in the database
 * (and, for voice/video/verification media, sets an ACL policy). Anything
 * that stays unbound is unusable to the app and is deleted here so the bucket
 * cannot be used as a free file sink.
 *
 * Safety rules — an object is only deleted when ALL of these hold:
 *  1. It has no ACL policy (never passed a validating bind endpoint), AND
 *  2. Its path is not referenced anywhere in the database (covers legacy
 *     profile photos that predate ACL binding), AND
 *  3. It is older than ORPHAN_MAX_AGE_MS, or larger than the hard size cap.
 *
 * Best-effort and idempotent: individual failures are logged and skipped.
 */
export async function sweepOrphanedUploads(): Promise<void> {
  const { ObjectStorageService } = await import("./replit_integrations/object_storage");
  const { getObjectAclPolicy } = await import(
    "./replit_integrations/object_storage/objectAcl"
  );

  const objectStorageService = new ObjectStorageService();

  // Collect every object path referenced by the database.
  const referenced = new Set<string>();
  const addRef = (value: string | null) => {
    if (value && value.startsWith("/objects/")) referenced.add(value);
  };

  const profileRows = await db
    .select({
      photoUrl: profiles.photoUrl,
      verificationPhotoUrl: profiles.verificationPhotoUrl,
      voiceIntroUrl: profiles.voiceIntroUrl,
      introVideoUrl: profiles.introVideoUrl,
    })
    .from(profiles);
  for (const row of profileRows) {
    addRef(row.photoUrl);
    addRef(row.verificationPhotoUrl);
    addRef(row.voiceIntroUrl);
    addRef(row.introVideoUrl);
  }

  const messageRows = await db
    .select({ voiceNoteUrl: messages.voiceNoteUrl })
    .from(messages)
    .where(isNotNull(messages.voiceNoteUrl));
  for (const row of messageRows) {
    addRef(row.voiceNoteUrl);
  }

  let deleted = 0;
  let kept = 0;
  let failed = 0;

  const files = await objectStorageService.listUploadEntityFiles();
  for (const file of files) {
    try {
      const entityPath = objectStorageService.getEntityPathForFile(file);
      if (referenced.has(entityPath)) {
        kept++;
        continue;
      }

      const acl = await getObjectAclPolicy(file);
      if (acl) {
        kept++;
        continue;
      }

      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size ?? 0);
      const createdAt = new Date(String(metadata.timeCreated ?? 0)).getTime();
      const age = Date.now() - (Number.isFinite(createdAt) ? createdAt : 0);

      if (size > ORPHAN_HARD_SIZE_CAP_BYTES || age > ORPHAN_MAX_AGE_MS) {
        await file.delete();
        deleted++;
      } else {
        kept++;
      }
    } catch (err: any) {
      failed++;
      log(`Upload sweep: failed on ${file.name}: ${err?.message ?? err}`);
    }
  }

  log(`Upload sweep complete: ${deleted} orphan(s) deleted, ${kept} kept, ${failed} failed`);
}
