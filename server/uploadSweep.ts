import { db } from "./db";
import { profiles, messages } from "@shared/schema";
import { isNotNull } from "drizzle-orm";
import { storage } from "./storage";

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [security] ${message}`);
}

// Orphans younger than this are kept: a legitimate user may still be between
// "upload finished" and "bind to profile/message" for a short while.
// 2 hours is generous for any normal upload flow.
const ORPHAN_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// No legitimate app upload exceeds this (largest allowed is a 50MB intro
// video). Unbound blobs over the cap are deleted immediately regardless of
// age, so oversized dumps can't sit in the bucket.
const ORPHAN_HARD_SIZE_CAP_BYTES = 50 * 1024 * 1024;

// Only these MIME type prefixes are produced by the app's legitimate upload
// flows. Unbound objects with any other content type are deleted immediately —
// they cannot have been uploaded by the normal client and are almost certainly
// abuse attempts.
const ALLOWED_MEDIA_TYPE_PREFIXES = ["image/", "audio/", "video/"];

function isAllowedMediaType(contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  return ALLOWED_MEDIA_TYPE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

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
 *  3. One or more of:
 *     a. Its content type is not an allowed media type (image/*, audio/*, video/*), OR
 *     b. It is larger than the hard size cap, OR
 *     c. It is older than ORPHAN_MAX_AGE_MS.
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
      const contentType = String(metadata.contentType ?? "");
      const createdAt = new Date(String(metadata.timeCreated ?? 0)).getTime();
      const age = Date.now() - (Number.isFinite(createdAt) ? createdAt : 0);

      // Delete immediately if non-media type (wrong content type is a strong
      // signal of abuse), oversized, or past the orphan grace window.
      const wrongType = contentType && !isAllowedMediaType(contentType);
      if (wrongType || size > ORPHAN_HARD_SIZE_CAP_BYTES || age > ORPHAN_MAX_AGE_MS) {
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

  // Clean up expired pending_uploads records and delete their GCS objects.
  // Pending records older than the signed URL TTL (300s) + a generous buffer
  // (600s) have definitely expired: the client had 5 minutes to PUT, then
  // call /api/uploads/verify. Any record still present after 15 minutes was
  // never verified and the underlying GCS object should be removed.
  const PENDING_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
  let pendingDeleted = 0;
  let pendingFailed = 0;
  try {
    const expiredPaths = await storage.deleteExpiredPendingUploads(PENDING_MAX_AGE_MS);
    for (const objectPath of expiredPaths) {
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath).catch(() => null);
        if (objectFile) {
          const existingAcl = await getObjectAclPolicy(objectFile).catch(() => null);
          if (!existingAcl) {
            // Only delete if not yet bound (no ACL means it was never verified+bound).
            await objectFile.delete();
            pendingDeleted++;
          }
        }
      } catch (err: any) {
        pendingFailed++;
        log(`Pending sweep: failed on ${objectPath}: ${err?.message ?? err}`);
      }
    }
    if (expiredPaths.length > 0) {
      log(`Pending upload sweep: ${pendingDeleted} GCS object(s) deleted, ${pendingFailed} failed (${expiredPaths.length} expired records removed)`);
    }
  } catch (err: any) {
    log(`Pending upload sweep error: ${err?.message ?? err}`);
  }
}
