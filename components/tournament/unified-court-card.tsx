"use client";

import type { HTMLAttributes } from "react";

type UnifiedCourtCardDensity = "standard" | "mobile" | "tv" | "scoreboard-large" | "scoreboard-medium" | "scoreboard-compact" | "scoreboard-high";
type UnifiedCourtCardTone = "plain" | "active" | "completed" | "ready";
type DataAttributes = Record<`data-${string}`, string | number | undefined>;
type ScoreValue = string | number;

interface UnifiedCourtCardProps {
  actionLabel?: string;
  articleProps?: HTMLAttributes<HTMLElement> & DataAttributes;
  className?: string;
  court: string;
  density?: UnifiedCourtCardDensity;
  leftPlayers: readonly string[];
  leftScore?: ScoreValue;
  onAction?: () => void;
  playerGridProps?: HTMLAttributes<HTMLDivElement> & DataAttributes;
  rightPlayers: readonly string[];
  rightScore?: ScoreValue;
  status: string;
  statusClassName?: string;
  testId?: string;
  testIdPrefix?: string;
  tone?: UnifiedCourtCardTone;
  unsavedLabel?: string;
}

const densityStyles: Record<UnifiedCourtCardDensity, {
  action: string;
  card: string;
  court: string;
  gap: string;
  player: string;
  score: string;
  separator: string;
  status: string;
  unsaved: string;
  vs: string;
}> = {
  standard: {
    action: "mt-1 min-h-12 text-sm",
    card: "gap-3 p-4",
    court: "text-xl",
    gap: "gap-x-3 gap-y-2",
    player: "text-lg",
    score: "text-5xl",
    separator: "text-3xl",
    status: "px-3 py-1 text-sm",
    unsaved: "px-4 py-2 text-base",
    vs: "px-2 py-1 text-xs",
  },
  mobile: {
    action: "mt-1 min-h-12 text-sm",
    card: "gap-3 p-3 sm:gap-4 sm:p-4",
    court: "text-2xl sm:text-3xl",
    gap: "gap-x-2 gap-y-2 sm:gap-x-3",
    player: "text-[clamp(1.02rem,4.6vw,1.45rem)] sm:text-xl",
    score: "text-6xl sm:text-7xl",
    separator: "text-4xl sm:text-5xl",
    status: "px-2.5 py-1 text-[0.68rem] sm:px-3 sm:text-xs",
    unsaved: "px-4 py-2 text-base sm:text-lg",
    vs: "px-1.5 py-1 text-xs sm:text-sm",
  },
  tv: {
    action: "mt-1 min-h-12 text-sm",
    card: "gap-4 p-4 lg:p-6",
    court: "text-3xl lg:text-4xl",
    gap: "gap-x-3 gap-y-2",
    player: "text-2xl lg:text-[clamp(1.55rem,2vw,2.75rem)]",
    score: "text-7xl lg:text-[clamp(4rem,6vw,8rem)]",
    separator: "text-5xl",
    status: "px-3 py-1 text-xs",
    unsaved: "px-4 py-2 text-2xl",
    vs: "px-2 py-1 text-sm",
  },
  "scoreboard-large": {
    action: "mt-1 min-h-12 text-sm",
    card: "gap-1.5 p-5 lg:p-6",
    court: "text-[clamp(1.8rem,2.6vw,3.25rem)]",
    gap: "gap-x-2 gap-y-1",
    player: "text-[clamp(1.7rem,2.45vw,2.95rem)]",
    score: "text-[clamp(4.6rem,8vw,9rem)]",
    separator: "text-[clamp(2.4rem,4vw,4.75rem)]",
    status: "px-2 py-1 text-[clamp(1rem,1.35vw,1.7rem)]",
    unsaved: "px-2 py-1 text-[clamp(1rem,1.35vw,1.7rem)]",
    vs: "px-1.5 py-1 text-[clamp(1.15rem,1.65vw,2rem)]",
  },
  "scoreboard-medium": {
    action: "mt-1 min-h-12 text-sm",
    card: "gap-1.5 p-3.5",
    court: "text-[clamp(1.2rem,1.55vw,1.9rem)]",
    gap: "gap-x-2 gap-y-1",
    player: "text-[clamp(1.04rem,1.32vw,1.48rem)]",
    score: "text-[clamp(2.8rem,4.9vw,5.4rem)]",
    separator: "text-[clamp(1.8rem,3vw,3.5rem)]",
    status: "px-2 py-1 text-[clamp(0.78rem,0.92vw,1rem)]",
    unsaved: "px-2 py-1 text-[clamp(0.78rem,0.92vw,1rem)]",
    vs: "px-1.5 py-1 text-[clamp(0.82rem,1.05vw,1.15rem)]",
  },
  "scoreboard-compact": {
    action: "mt-1 min-h-12 text-sm",
    card: "gap-1.5 p-2.5",
    court: "text-[clamp(0.95rem,1.1vw,1.35rem)]",
    gap: "gap-x-2 gap-y-0.5",
    player: "text-[clamp(0.84rem,0.99vw,1.1rem)]",
    score: "text-[clamp(1.85rem,3.2vw,3.5rem)]",
    separator: "text-[clamp(1.15rem,2vw,2.35rem)]",
    status: "px-2 py-1 text-[clamp(0.62rem,0.74vw,0.82rem)]",
    unsaved: "px-2 py-1 text-[clamp(0.62rem,0.74vw,0.82rem)]",
    vs: "px-1.5 py-1 text-[clamp(0.64rem,0.78vw,0.86rem)]",
  },
  "scoreboard-high": {
    action: "mt-1 min-h-12 text-sm",
    card: "gap-0 px-1 py-0.5",
    court: "text-[clamp(0.82rem,0.92vw,1.1rem)]",
    gap: "gap-x-1 gap-y-0",
    player: "text-[clamp(0.78rem,0.9vw,1.05rem)]",
    score: "text-[clamp(1.45rem,2.5vw,2.75rem)]",
    separator: "text-[clamp(0.95rem,1.55vw,1.75rem)]",
    status: "px-1 py-0.5 text-[clamp(0.54rem,0.62vw,0.7rem)]",
    unsaved: "px-2 py-1 text-[clamp(0.54rem,0.62vw,0.7rem)]",
    vs: "px-1.5 py-1 text-[clamp(0.56rem,0.66vw,0.74rem)]",
  },
};

export function UnifiedCourtCard({
  actionLabel,
  articleProps,
  className = "",
  court,
  density = "standard",
  leftPlayers,
  leftScore,
  onAction,
  playerGridProps,
  rightPlayers,
  rightScore,
  status,
  statusClassName,
  testId = "unified-court-card",
  testIdPrefix = "unified-court",
  tone = "plain",
  unsavedLabel = "Ikke gemt",
}: UnifiedCourtCardProps) {
  const styles = densityStyles[density];
  const hasScore = leftScore !== undefined && rightScore !== undefined;
  const isScoreboard = testIdPrefix === "scoreboard";
  const { className: playerGridClassName = "", ...restPlayerGridProps } = playerGridProps ?? {};

  return (
    <article
      className={`grid min-w-0 overflow-hidden rounded-md border text-center shadow-sm ${getToneClass(tone)} ${styles.card} ${className}`}
      data-card-structure="unified-court-card"
      data-density={density}
      data-testid={testId}
      {...articleProps}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h3 className={`${styles.court} min-w-0 font-black uppercase leading-none text-[var(--primary-strong)]`}>{court}</h3>
        <span className={`shrink-0 rounded-md font-black uppercase leading-none ${styles.status} ${statusClassName ?? getStatusClass(status)}`}>{status}</span>
      </div>

      <div className={`mx-auto grid w-full min-w-0 max-w-[38rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[auto_auto] items-center ${styles.gap} ${playerGridClassName}`} data-layout="split-scoreboard-symmetric" data-testid={`${testIdPrefix}-player-grid`} {...restPlayerGridProps}>
        <PlayerLine index={1} name={leftPlayers[0] ?? ""} side="left" styles={styles.player} testIdPrefix={testIdPrefix} />
        <div className={`${styles.vs} col-start-2 row-span-2 row-start-1 justify-self-center self-center rounded-md bg-white/65 font-black uppercase leading-none text-[var(--muted)]`} data-position={isScoreboard ? "center-middle" : undefined} data-testid={`${testIdPrefix}-vs`}>VS</div>
        <PlayerLine index={1} name={rightPlayers[0] ?? ""} side="right" styles={styles.player} testIdPrefix={testIdPrefix} />
        <PlayerLine index={2} name={leftPlayers[1] ?? ""} side="left" styles={styles.player} testIdPrefix={testIdPrefix} />
        <PlayerLine index={2} name={rightPlayers[1] ?? ""} side="right" styles={styles.player} testIdPrefix={testIdPrefix} />
      </div>

      {hasScore ? (
        <div className="mx-auto grid w-full max-w-[38rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 text-center" data-layout="split-scoreboard-symmetric" data-testid={`${testIdPrefix}-score-row`} aria-label={`Score ${leftScore} mod ${rightScore}`}>
          <ScoreValue value={leftScore} className={styles.score} scoreAlign={isScoreboard ? "left-third-center" : undefined} testId={`${testIdPrefix}-left-score`} />
          <span className={`${styles.separator} min-w-[1.25ch] whitespace-nowrap px-1 font-black leading-none text-[var(--muted)]`} data-testid={`${testIdPrefix}-score-separator`}>-</span>
          <ScoreValue value={rightScore} className={styles.score} scoreAlign={isScoreboard ? "right-third-center" : undefined} testId={`${testIdPrefix}-right-score`} />
        </div>
      ) : (
        <p className={`justify-self-center rounded-md border border-[var(--line)] bg-white/70 font-black uppercase leading-tight text-[var(--muted)] ${styles.unsaved}`} data-badge-position={isScoreboard ? "under-vs" : undefined} data-name-score-spacing={isScoreboard ? "increased" : undefined} data-testid={`${testIdPrefix}-unsaved-status`}>{unsavedLabel}</p>
      )}

      {actionLabel && onAction ? (
        <button className={`${styles.action} w-full rounded-md bg-[var(--primary)] px-4 font-black uppercase text-[var(--primary-text)] shadow-sm`} type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

export function splitCourtTeamName(teamName: string): string[] {
  return teamName
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function PlayerLine({ index, name, side, styles, testIdPrefix }: { index: 1 | 2; name: string; side: "left" | "right"; styles: string; testIdPrefix: string }) {
  const scoreboardProps = testIdPrefix === "scoreboard" ? {
    "data-position": `${side}-${index === 1 ? "top" : "bottom"}`,
    "data-team-align": `centered-at-${side}-third`,
  } : {};

  return (
    <span
      className={`${side === "left" ? "col-start-1" : "col-start-3"} ${index === 1 ? "row-start-1" : "row-start-2"} w-full min-w-0 justify-self-center text-center ${styles} font-black leading-tight`}
      data-testid={`${testIdPrefix}-${side}-player-${index}`}
      style={{ overflowWrap: "anywhere", wordBreak: "normal" }}
      {...scoreboardProps}
    >
      {name}
    </span>
  );
}

function ScoreValue({ className, scoreAlign, testId, value }: { className: string; scoreAlign?: string; testId: string; value: ScoreValue }) {
  return (
    <span className={`${className} min-w-[2ch] whitespace-nowrap font-black leading-none [word-break:keep-all]`} data-name-score-spacing={scoreAlign ? "increased" : undefined} data-score-align={scoreAlign} data-testid={testId}>
      {value}
    </span>
  );
}

function getToneClass(tone: UnifiedCourtCardTone): string {
  switch (tone) {
    case "active":
      return "border-yellow-200 bg-yellow-50";
    case "completed":
      return "border-green-200 bg-green-50";
    case "ready":
      return "border-[var(--line)] bg-[var(--card)]";
    case "plain":
      return "border-[var(--line)] bg-[var(--card)]";
  }
}

function getStatusClass(status: string): string {
  if (status === "Afsluttet") {
    return "bg-green-100 text-[var(--primary-strong)]";
  }

  if (status === "I gang") {
    return "bg-yellow-100 text-yellow-800";
  }

  return "bg-gray-100 text-[var(--muted)]";
}
