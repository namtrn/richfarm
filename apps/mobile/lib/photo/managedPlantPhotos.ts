import { Directory, File, Paths } from 'expo-file-system';
import type { OutboxEnvelope } from '../sync/queue';
import type { SyncPhotoPayload } from '../sync/types';

function stableHash(value: string) {
  let left = 2166136261;
  let right = 3339675911;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ code, 2246822519);
  }
  return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

function sourceExtension(uri: string) {
  const match = uri.split(/[?#]/, 1)[0]?.match(/\.([a-zA-Z0-9]{1,8})$/);
  return match ? `.${match[1].toLowerCase()}` : '.jpg';
}

function scopeDirectory(scope: string) {
  // Paths.document is app-private. Never export these retry files through MediaStore/MediaLibrary;
  // otherwise Android gallery apps would show a duplicate of a user-selected photo.
  return new Directory(Paths.document, 'richfarm', 'plant-photos', stableHash(scope));
}

export function isManagedPlantPhotoUri(uri: string) {
  return uri.startsWith(new Directory(Paths.document, 'richfarm', 'plant-photos').uri);
}

export function managedPlantPhotoUri(scope: string, plantUuid: string, photoUuid: string, extension = '.jpg') {
  return new File(
    scopeDirectory(scope),
    safeSegment(plantUuid),
    `${safeSegment(photoUuid)}${extension}`,
  ).uri;
}

export async function stageManagedPlantPhoto(input: {
  sourceUri: string;
  scope: string;
  plantUuid: string;
  photoUuid: string;
}) {
  const destinationDirectory = new Directory(scopeDirectory(input.scope), safeSegment(input.plantUuid));
  destinationDirectory.create({ intermediates: true, idempotent: true });
  const destination = new File(
    destinationDirectory,
    `${safeSegment(input.photoUuid)}${sourceExtension(input.sourceUri)}`,
  );
  if (destination.exists) destination.delete();
  new File(input.sourceUri).copy(destination);
  if (!destination.exists || destination.size <= 0) throw new Error('photo_stage_verification_failed');
  return destination.uri;
}

export async function copyManagedPlantPhotoToScope(input: {
  managedUri: string;
  targetScope: string;
  plantUuid: string;
  photoUuid: string;
}) {
  if (!isManagedPlantPhotoUri(input.managedUri)) return input.managedUri;
  const source = new File(input.managedUri);
  if (!source.exists) throw new Error('managed_photo_missing');
  const directory = new Directory(scopeDirectory(input.targetScope), safeSegment(input.plantUuid));
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, `${safeSegment(input.photoUuid)}${source.extension || '.jpg'}`);
  if (!destination.exists) source.copy(destination);
  if (!destination.exists || destination.size <= 0) throw new Error('managed_photo_claim_copy_failed');
  return destination.uri;
}

export function removeManagedPlantPhoto(uri?: string) {
  if (!uri || !isManagedPlantPhotoUri(uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function clearManagedPlantPhotoScope(scope: string) {
  const directory = scopeDirectory(scope);
  if (directory.exists) directory.delete();
}

export function cleanupManagedPlantPhotoOrphans(scope: string, outbox: OutboxEnvelope) {
  const referenced = new Set<string>();
  for (const action of [...outbox.operations, ...outbox.quarantine]) {
    if (action.type !== 'photo') continue;
    const uri = (action.payload as SyncPhotoPayload).managedUri;
    if (uri) referenced.add(uri);
  }
  const root = scopeDirectory(scope);
  if (!root.exists) return 0;
  let removed = 0;
  for (const child of root.list()) {
    if (!(child instanceof Directory)) continue;
    for (const file of child.list()) {
      if (file instanceof File && !referenced.has(file.uri)) {
        file.delete();
        removed += 1;
      }
    }
  }
  return removed;
}
