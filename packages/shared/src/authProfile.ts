type AnonymousProfileLike = {
  isAnonymous?: boolean | null;
  name?: string | null;
  email?: string | null;
};

const ANONYMOUS_NAME_VALUES = new Set([
  "anonymous",
  "anonymous user",
  "anonymous device",
]);

const TEMP_EMAIL_PATTERN = /^temp@[a-z0-9._-]+\.[a-z]{2,}$/i;

export function normalizeProfileText(value?: string | null) {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function isAnonymousProfile(args: AnonymousProfileLike) {
  if (args.isAnonymous === true) {
    return true;
  }

  const email = normalizeProfileText(args.email)?.toLowerCase();
  if (!email || !TEMP_EMAIL_PATTERN.test(email)) {
    return false;
  }

  const name = normalizeProfileText(args.name)?.toLowerCase();
  return !name || ANONYMOUS_NAME_VALUES.has(name);
}

export function sanitizeAnonymousProfile<T extends AnonymousProfileLike>(
  profile: T
) {
  const isAnonymous = isAnonymousProfile(profile);
  const name = normalizeProfileText(profile.name);
  const email = normalizeProfileText(profile.email);

  return {
    ...profile,
    isAnonymous,
    name: isAnonymous ? undefined : name,
    email: isAnonymous ? undefined : email,
  };
}
