export {
  ObjectStorageService,
  ObjectNotFoundError,
  ObjectValidationError,
  objectStorageClient,
} from "./objectStorage";

export type { UploadConstraints } from "./objectStorage";

export type {
  ObjectAclPolicy,
  ObjectAccessGroup,
  ObjectAccessGroupType,
  ObjectAclRule,
} from "./objectAcl";

export {
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

export { registerObjectStorageRoutes } from "./routes";

