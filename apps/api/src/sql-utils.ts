const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSafeIdentifier(input: string): boolean {
  return IDENTIFIER_REGEX.test(input);
}

export function quoteIdentifier(input: string): string {
  if (!isSafeIdentifier(input)) {
    throw new Error(`Unsafe SQL identifier: ${input}`);
  }

  return `"${input}"`;
}

export function isNumericType(type: string): boolean {
  const upperType = type.toUpperCase();
  return (
    upperType.includes("INT") ||
    upperType.includes("REAL") ||
    upperType.includes("FLOA") ||
    upperType.includes("DOUB") ||
    upperType.includes("NUM") ||
    upperType.includes("DEC")
  );
}
