const internalCredentialEmailDomain = "users.lezgotournament.internal";

export function createInternalCredentialEmailFromNormalizedUsername(username: string): string {
  return `${username}@${internalCredentialEmailDomain}`;
}

export function isInternalCredentialEmail(value: string | null | undefined): boolean {
  return typeof value === "string" && value.toLocaleLowerCase("en").endsWith(`@${internalCredentialEmailDomain}`);
}

export function toPublicCredentialEmail(value: string | null | undefined): string {
  return isInternalCredentialEmail(value) ? "" : value ?? "";
}
