import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Thrown when an uploaded object fails size/type validation at bind time.
// The offending object is deleted (best effort) before this is thrown.
export class ObjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectValidationError";
    Object.setPrototypeOf(this, ObjectValidationError.prototype);
  }
}

// Server-side constraints enforced against the object's REAL stored metadata
// (not client-declared values). Entries in allowedContentTypes may be exact
// MIME types ("image/png") or prefixes ending in "/" ("audio/").
export interface UploadConstraints {
  maxSizeBytes: number;
  allowedContentTypes: string[];
}

function contentTypeAllowed(contentType: string, allowed: string[]): boolean {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  return allowed.some((entry) =>
    entry.endsWith("/") ? normalized.startsWith(entry) : normalized === entry
  );
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with a short TTL. 5 minutes is enough for
    // the client to start the upload immediately after requesting the URL.
    // A shorter window limits how long a stolen or leaked URL remains usable.
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 300,
    });
  }

  // Allocates a new upload slot (UUID-based object path) without signing a
  // GCS URL. Callers should direct the client to PUT to
  // /api/uploads/media/:uuid on the app server instead, which enforces
  // content-type and byte-limit constraints before writing to GCS.
  createObjectEntityPath(): string {
    return `/objects/uploads/${randomUUID()}`;
  }

  // Returns the raw GCS File reference for an upload slot without requiring
  // the object to already exist. Used by the server-side upload proxy to
  // write validated client data directly to GCS (bypassing signed URLs).
  getObjectEntitySlotFile(objectPath: string): File {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice("/objects/".length);
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const fullPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return objectStorageClient.bucket(bucketName).file(objectName);
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
  
    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  // If the object already has an ACL, the requestingUserId must match the existing
  // owner. This prevents one user from hijacking another user's uploaded object by
  // submitting its path to a media-binding endpoint.
  //
  // When `constraints` are provided, the object's REAL stored metadata (size and
  // content type as recorded by object storage) is validated before the ACL is
  // set. The signed upload URL cannot enforce limits, so this bind-time check is
  // the authoritative enforcement point. Objects that fail validation are
  // deleted (best effort) and an ObjectValidationError is thrown, so oversized
  // or mistyped uploads can never be attached to app media features.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
    requestingUserId: string,
    constraints?: UploadConstraints
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);

    // Check existing ownership before overwriting the ACL.
    const existingAcl = await getObjectAclPolicy(objectFile);
    if (existingAcl && existingAcl.owner !== requestingUserId) {
      throw new Error("Object is already owned by another user");
    }

    if (constraints) {
      const [metadata] = await objectFile.getMetadata();
      const actualSize = Number(metadata.size ?? 0);
      const actualType = String(metadata.contentType ?? "");

      let violation: string | null = null;
      if (!Number.isFinite(actualSize) || actualSize <= 0) {
        violation = "Uploaded file is empty or has an unreadable size";
      } else if (actualSize > constraints.maxSizeBytes) {
        const maxMb = Math.round(constraints.maxSizeBytes / (1024 * 1024));
        violation = `Uploaded file is too large (maximum ${maxMb}MB)`;
      } else if (!actualType || !contentTypeAllowed(actualType, constraints.allowedContentTypes)) {
        violation = "Uploaded file has an unsupported type";
      }

      if (violation) {
        // Only delete when the requester has PROVEN ownership via an existing
        // ACL. Objects with no ACL must not be deleted here: object paths can
        // leak (e.g. profile photo URLs are visible to other users), and an
        // attacker could otherwise destroy someone else's not-yet-bound or
        // legacy ACL-less object by submitting its path to an endpoint with
        // mismatched constraints. Unowned orphans are cleaned up by the
        // periodic upload sweep instead.
        if (existingAcl && existingAcl.owner === requestingUserId) {
          try {
            await objectFile.delete();
          } catch (err) {
            console.error(`Failed to delete invalid upload ${normalizedPath}:`, err);
          }
        }
        throw new ObjectValidationError(violation);
      }
    }

    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Lists all objects in the private uploads area. Used by the periodic
  // security sweep that removes orphaned (never-bound) uploads.
  async listUploadEntityFiles(): Promise<File[]> {
    let dir = this.getPrivateObjectDir();
    if (!dir.endsWith("/")) {
      dir = `${dir}/`;
    }
    const { bucketName, objectName } = parseObjectPath(`${dir}uploads/`);
    const [files] = await objectStorageClient
      .bucket(bucketName)
      .getFiles({ prefix: objectName });
    return files;
  }

  // Converts an uploads-area File back to its public "/objects/..." path.
  getEntityPathForFile(file: File): string {
    let dir = this.getPrivateObjectDir();
    if (!dir.endsWith("/")) {
      dir = `${dir}/`;
    }
    const { objectName: dirObjectName } = parseObjectPath(dir);
    const name = file.name.startsWith(dirObjectName)
      ? file.name.slice(dirObjectName.length)
      : file.name;
    return `/objects/${name}`;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

