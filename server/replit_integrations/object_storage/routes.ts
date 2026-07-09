import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { isAuthenticated } from "../auth";
import { canAccessObject, getObjectAclPolicy, ObjectPermission } from "./objectAcl";
import { storage } from "../../storage";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Upload-URL issuance is rate limited per user. The signed PUT URL itself
// cannot enforce size/type limits, so bounding how many URLs a user can mint
// is the first line of defense against using the bucket as a file sink.
const UPLOAD_URL_RATE_LIMIT = 30;
const UPLOAD_URL_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", isAuthenticated, async (req: any, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      // size and contentType are REQUIRED. Omitting them must not bypass
      // validation — the previous truthiness checks let a client skip both
      // limits entirely by leaving the fields out.
      if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
        return res.status(400).json({
          error: "Missing or invalid required field: size",
        });
      }

      if (size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: "File too large. Maximum size is 5MB.",
        });
      }

      if (typeof contentType !== "string" || !ALLOWED_IMAGE_TYPES.includes(contentType)) {
        return res.status(400).json({
          error: "Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed.",
        });
      }

      const userId = req.user?.claims?.sub;
      const withinQuota = await storage.checkRateLimit(
        `${userId}:upload-request-url`,
        UPLOAD_URL_RATE_LIMIT,
        UPLOAD_URL_RATE_WINDOW_MS,
      );
      if (!withinQuota) {
        return res.status(429).json({
          error: "Too many uploads. Please try again later.",
        });
      }

      // Per-user byte quota: limits total declared upload volume per window,
      // capping the storage-abuse blast radius even if a client lies about
      // individual file sizes.
      const withinBytesQuota = await storage.checkBytesQuota(
        `${userId}:upload-request-url-bytes`,
        size,
        50 * 1024 * 1024, // 50MB per hour
        UPLOAD_URL_RATE_WINDOW_MS,
      );
      if (!withinBytesQuota) {
        return res.status(429).json({
          error: "Upload quota exceeded. Please try again later.",
        });
      }

      // Allocate a server-controlled upload slot instead of a signed GCS URL.
      // The client PUTs to /api/uploads/media/:uuid on our server, which
      // enforces content-type and byte limits at ingest time.
      const objectPath = objectStorageService.createObjectEntityPath();
      const uuid = objectPath.split("/").pop()!;
      const uploadURL = `/api/uploads/media/${uuid}`;

      await storage.createPendingUpload(objectPath, userId, "image/", MAX_FILE_SIZE);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/uploads/:id
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/uploads/:id", isAuthenticated, async (req: any, res) => {
    try {
      const objectPath = `/objects/uploads/${req.params.id}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

      // Authorization: every object must have an explicit ACL policy.
      // Objects without one are denied — there is no implicit fallback that
      // grants access to authenticated users, because that would make
      // authentication the only protection for sensitive uploads such as
      // verification photos and voice notes.
      const userId: string | undefined = req.user?.claims?.sub;
      const aclPolicy = await getObjectAclPolicy(objectFile);
      if (!aclPolicy) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const allowed = await canAccessObject({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!allowed) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

