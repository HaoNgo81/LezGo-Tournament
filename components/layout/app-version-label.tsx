export function formatAppVersionLabel(commit: string | undefined, environment: string | undefined): string {
  const shortCommit = commit?.trim().slice(0, 7) || "lokal";
  const environmentLabel = environment === "production" ? "" : environment === "preview" ? " · Testversion" : " · Udvikling";

  return `Version ${shortCommit}${environmentLabel}`;
}

export function AppVersionLabel() {
  const label = formatAppVersionLabel(process.env.NEXT_PUBLIC_LEZGO_APP_COMMIT, process.env.NEXT_PUBLIC_LEZGO_APP_ENVIRONMENT);

  return (
    <p className="text-center text-xs font-bold text-[var(--muted)]" data-testid="app-version-label">
      {label}
    </p>
  );
}
