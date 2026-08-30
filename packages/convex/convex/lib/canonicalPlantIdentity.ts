/**
 * Convex-facing consumer for the shared v1 identity contract.
 *
 * This adapter is deliberately pure: it does not read/write Convex tables,
 * infer taxonomy from display names, or add schema fields. Mutation and seed
 * boundaries can adopt this function incrementally in a later package.
 */
import {
  canonicalKeyFromPlantIdentity,
  normalizeCanonicalPlantIdentity,
  type CanonicalPlantIdentity,
  type CanonicalPlantIdentityInput,
} from "../../../shared/src/canonicalPlantIdentity";

export type ConvexCanonicalPlantIdentityInput = CanonicalPlantIdentityInput;
export type ConvexCanonicalPlantIdentity = CanonicalPlantIdentity;

export function canonicalKeyForConvexPlant(input: ConvexCanonicalPlantIdentityInput): string {
  return canonicalKeyFromPlantIdentity(input);
}

export function normalizeConvexPlantIdentity(input: ConvexCanonicalPlantIdentityInput): ConvexCanonicalPlantIdentity {
  return normalizeCanonicalPlantIdentity(input);
}
