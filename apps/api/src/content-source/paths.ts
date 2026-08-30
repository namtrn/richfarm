import path from "node:path";

import {
  CONTENT_MANIFEST_FILENAME,
  CONTENT_SOURCE_MARKDOWN_SUFFIX,
  CONTENT_SOURCE_ROOTS,
  DEFAULT_REQUIRED_LOCALES,
  type ContentEntityKind,
  type ContentSourceFileKind,
} from "./contract";

export class InvalidContentSourcePathError extends Error {
  constructor(message: string) {
    super(`CONTENT_SOURCE_PATH_INVALID: ${message}`);
    this.name = "InvalidContentSourcePathError";
  }
}

export interface ContentSourcePathClassification {
  rootKey: string;
  entityKind: ContentEntityKind;
  fileKind: ContentSourceFileKind;
  /** Entity directory relative to the watched root, e.g. `solanum-lycopersicum`. */
  entityDir: string;
  locale: string | null;
}

/**
 * Normalize an absolute path into a repository-relative POSIX path. Rejects
 * traversal and anything outside the repository root before persistence.
 */
export function normalizeRepositoryRelativePath(
  repositoryRoot: string,
  absolutePath: string,
): string {
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvalidContentSourcePathError(absolutePath);
  }
  return relative.split(path.sep).join("/");
}

function matchRoot(relPath: string): { rootKey: string; entityKind: ContentEntityKind; rest: string } | null {
  for (const root of CONTENT_SOURCE_ROOTS) {
    if (relPath === root.relRoot || relPath.startsWith(`${root.relRoot}/`)) {
      return {
        rootKey: root.rootKey,
        entityKind: root.entityKind,
        rest: relPath.slice(root.relRoot.length + 1),
      };
    }
  }
  return null;
}

export interface ClassifyOptions {
  requiredLocales?: readonly string[];
}

/**
 * Classify a normalized repository-relative path against the configured
 * content roots. Returns null for unsupported paths (unknown locale suffix,
 * non-Markdown files, README, plans, etc.) which must not be watched or
 * indexed.
 */
export function classifyRelativeContentPath(
  relPath: string,
  options: ClassifyOptions = {},
): ContentSourcePathClassification | null {
  const matched = matchRoot(relPath);
  if (!matched) {
    return null;
  }

  const segments = matched.rest.split("/");
  if (segments.length < 2) {
    return null;
  }
  const fileName = segments[segments.length - 1];
  const entityDir = segments.slice(0, -1).join("/");
  if (entityDir.length === 0 || fileName.length === 0) {
    return null;
  }

  if (fileName === CONTENT_MANIFEST_FILENAME) {
    return {
      rootKey: matched.rootKey,
      entityKind: matched.entityKind,
      fileKind: "manifest",
      entityDir,
      locale: null,
    };
  }

  if (!fileName.endsWith(CONTENT_SOURCE_MARKDOWN_SUFFIX)) {
    return null;
  }

  const requiredLocales = options.requiredLocales ?? DEFAULT_REQUIRED_LOCALES;
  const locale = fileName.slice(0, -CONTENT_SOURCE_MARKDOWN_SUFFIX.length);
  if (!requiredLocales.includes(locale)) {
    return null;
  }

  return {
    rootKey: matched.rootKey,
    entityKind: matched.entityKind,
    fileKind: "markdown",
    entityDir,
    locale,
  };
}

/** Owning manifest path for any supported file inside an entity directory. */
export function owningManifestRelativePath(entityRelDir: string): string {
  return `${entityRelDir}/${CONTENT_MANIFEST_FILENAME}`;
}

/**
 * Unicode-normalized case-folded collision key. On case-insensitive or
 * normalization-insensitive filesystems two distinct contract paths can share
 * one physical file; both must then be marked invalid and never applied.
 */
export function caseFoldCollisionKey(relPath: string): string {
  return relPath.normalize("NFC").toLowerCase();
}

export function findCaseFoldCollisions(
  relPaths: readonly string[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const relPath of relPaths) {
    const key = caseFoldCollisionKey(relPath);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(relPath);
    } else {
      grouped.set(key, [relPath]);
    }
  }
  const collisions = new Map<string, string[]>();
  for (const [key, paths] of grouped) {
    if (paths.length > 1 && new Set(paths).size > 1) {
      collisions.set(key, paths.sort());
    }
  }
  return collisions;
}
