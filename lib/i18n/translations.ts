export type AppLanguage = "da" | "en";

export type TranslationKey =
  | "activeTournament"
  | "active"
  | "alarmSound"
  | "allCourts"
  | "allPlayers"
  | "appBrand"
  | "appSubtitle"
  | "background"
  | "back"
  | "cardBackground"
  | "cancel"
  | "completed"
  | "close"
  | "completedTournament"
  | "copyLink"
  | "createTemplate"
  | "court"
  | "courts"
  | "dark"
  | "draws"
  | "edit"
  | "editScore"
  | "editTemplate"
  | "delete"
  | "enterScore"
  | "finishTournament"
  | "finalStandings"
  | "foreground"
  | "fullStandings"
  | "language"
  | "lezgo"
  | "light"
  | "liveScore"
  | "losses"
  | "matches"
  | "matchesInActiveRound"
  | "matchPoints"
  | "mostMatchPoints"
  | "mostScorePoints"
  | "name"
  | "newTournamentDescription"
  | "newTournamentTitle"
  | "next"
  | "numberOfScorePoints"
  | "oneNamePerLine"
  | "players"
  | "playByTime"
  | "playToScorePoints"
  | "position"
  | "previous"
  | "primaryButtonColor"
  | "rankingSort"
  | "ready"
  | "resetTheme"
  | "round"
  | "roundComplete"
  | "roundIncomplete"
  | "rounds"
  | "saveSettings"
  | "scoring"
  | "scorePoints"
  | "fixedPartnerAmericano"
  | "fixedPartnerMexicano"
  | "fixedScore"
  | "format"
  | "finalPlacements"
  | "homeNewTournamentDescription"
  | "homeSettingsDescription"
  | "homeTemplatesDescription"
  | "homeTemplatesTitle"
  | "homeTournamentsDescription"
  | "loadingSettings"
  | "loadingTemplates"
  | "loadingTournament"
  | "loadingTournaments"
  | "loadingShare"
  | "resumeTimer"
  | "savedInRound"
  | "registerScorePoints"
  | "linkCopied"
  | "noActiveTournaments"
  | "noCompletedTournaments"
  | "openLive"
  | "openQr"
  | "openTeamMatch"
  | "openTvScreen"
  | "review"
  | "save"
  | "seeFinalStandings"
  | "secondaryButtonColor"
  | "settingsSaved"
  | "settings"
  | "settingsDescription"
  | "standardsForNewTournaments"
  | "startTournament"
  | "startTemplate"
  | "templates"
  | "templatesDescription"
  | "team"
  | "teams"
  | "timeLimitMinutes"
  | "timeFreeScoring"
  | "totalScorePoints"
  | "totalScorePointsCount"
  | "tournaments"
  | "tournamentsDescription"
  | "tournamentFormat"
  | "tournamentSettings"
  | "shareTournament"
  | "startTimer"
  | "stopTimer"
  | "surface"
  | "testSound"
  | "theme"
  | "themeAccent"
  | "themeCustom"
  | "themePreset"
  | "timerReset"
  | "timerStartsAfterCountdown"
  | "timerStoppedCanResume"
  | "tvMirror"
  | "wins";

export const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
  da: {
    activeTournament: "Aktiv turnering",
    active: "Aktive",
    alarmSound: "Alarmlyd",
    allCourts: "Alle baner",
    allPlayers: "Alle spillere",
    appBrand: "LEZGO PADEL",
    appSubtitle: "Hurtig turneringsstyring til telefon og tablet.",
    background: "Baggrund",
    back: "Tilbage",
    cardBackground: "Kort-/panelbaggrund",
    cancel: "Annuller",
    completed: "Afsluttet",
    close: "Luk",
    completedTournament: "Afsluttet turnering",
    copyLink: "Kopier link",
    createTemplate: "Opret skabelon",
    court: "Bane",
    courts: "Baner",
    dark: "Mørk",
    draws: "Uafgjort",
    edit: "Rediger",
    editScore: "Rediger score",
    editTemplate: "Rediger skabelon",
    delete: "Slet",
    enterScore: "Indtast score",
    finishTournament: "Afslut turnering",
    finalStandings: "Slutstilling",
    foreground: "Primær tekstfarve",
    fullStandings: "Hele stillingen",
    language: "Sprog",
    lezgo: "LezGo",
    light: "Lys",
    liveScore: "Live score",
    losses: "Tab",
    matches: "Kampe",
    matchesInActiveRound: "Kampe i aktiv runde",
    matchPoints: "Matchpoint",
    mostMatchPoints: "Flest matchpoint",
    mostScorePoints: "Flest scorepoint",
    name: "Navn",
    newTournamentDescription: "Opret en turnering med format, spillere, baner, runder og stillingssortering.",
    newTournamentTitle: "Ny turnering",
    next: "Næste",
    numberOfScorePoints: "Antal scorepoint",
    oneNamePerLine: "Et navn pr. linje",
    players: "Spillere",
    playByTime: "Spil på tid",
    playToScorePoints: "Spil til antal scorepoint",
    position: "Placering",
    previous: "Forrige",
    primaryButtonColor: "Primær knapfarve",
    rankingSort: "Sorter stilling efter",
    ready: "Klar",
    resetTheme: "Nulstil tema",
    round: "Runde",
    roundComplete: "Runden er færdigscoret.",
    roundIncomplete: "Alle kampe skal gemmes før næste runde.",
    rounds: "Runder",
    saveSettings: "Gem indstillinger",
    scoring: "Scoring",
    scorePoints: "Scorepoint",
    fixedPartnerAmericano: "Fast Makker Americano",
    fixedPartnerMexicano: "Fast Makker Mexicano",
    fixedScore: "Fast score",
    format: "Format",
    finalPlacements: "Slutplaceringer",
    homeNewTournamentDescription: "Vælg format, indstillinger og spillere.",
    homeSettingsDescription: "Kun de nødvendige valg.",
    homeTemplatesDescription: "Opret, rediger, slet eller start fra skabelon.",
    homeTemplatesTitle: "Turneringsskabeloner",
    homeTournamentsDescription: "Aktive, kommende, afsluttede og tidligere.",
    loadingSettings: "Indlæser indstillinger...",
    loadingTemplates: "Indlæser skabeloner...",
    loadingTournament: "Indlæser turnering...",
    loadingTournaments: "Indlæser turneringer...",
    loadingShare: "Indlæser deling...",
    resumeTimer: "Fortsæt ur",
    savedInRound: "Gemt i runden",
    registerScorePoints: "Registrer scorepoint",
    linkCopied: "Link kopieret.",
    noActiveTournaments: "Ingen aktive turneringer.",
    noCompletedTournaments: "Ingen afsluttede turneringer endnu.",
    openLive: "Åbn live",
    openQr: "Åbn QR",
    openTeamMatch: "Åbn holdkamp",
    openTvScreen: "Åbn TV-skærm",
    review: "Gennemse",
    save: "Gem",
    seeFinalStandings: "Se slutstilling",
    secondaryButtonColor: "Sekundær knapfarve",
    settingsSaved: "Indstillinger gemt.",
    settings: "Indstillinger",
    settingsDescription: "Standarder, der bruges automatisk ved nye turneringer.",
    standardsForNewTournaments: "Standarder for nye turneringer",
    startTournament: "Start turnering",
    startTemplate: "Start",
    templates: "Skabeloner",
    templatesDescription: "Opret, rediger, slet og start fra skabelon.",
    team: "Hold",
    teams: "Hold",
    timeLimitMinutes: "Spilletid (minutter)",
    timeFreeScoring: "Tid (fri scoring)",
    totalScorePoints: "Samlet til antal scorepoint",
    totalScorePointsCount: "Samlet antal scorepoint",
    tournaments: "Turneringer",
    tournamentsDescription: "Aktive og afsluttede turneringer gemmes lokalt.",
    tournamentFormat: "Turneringsform",
    tournamentSettings: "Turneringsindstillinger",
    shareTournament: "Del turnering",
    startTimer: "Start ur",
    stopTimer: "Stop ur",
    surface: "Kortbaggrund",
    testSound: "Test lyd",
    theme: "Tema",
    themeAccent: "Accentfarve",
    themeCustom: "Brugerdefineret",
    themePreset: "Tema",
    timerReset: "Nulstil ur",
    timerStartsAfterCountdown: "15 sekunders nedtælling før uret starter.",
    timerStoppedCanResume: "Uret er stoppet og fortsætter fra den viste tid.",
    tvMirror: "TV / Mirror",
    wins: "Sejre",
  },
  en: {
    activeTournament: "Active tournament",
    active: "Active",
    alarmSound: "Alarm sound",
    allCourts: "All courts",
    allPlayers: "All players",
    appBrand: "LEZGO PADEL",
    appSubtitle: "Fast tournament management for phone and tablet.",
    background: "Background",
    back: "Back",
    cardBackground: "Card/panel background",
    cancel: "Cancel",
    completed: "Completed",
    close: "Close",
    completedTournament: "Completed tournament",
    copyLink: "Copy link",
    createTemplate: "Create template",
    court: "Court",
    courts: "Courts",
    dark: "Dark",
    draws: "Draws",
    edit: "Edit",
    editScore: "Edit score",
    editTemplate: "Edit template",
    delete: "Delete",
    enterScore: "Enter score",
    finishTournament: "Finish tournament",
    finalStandings: "Final standings",
    foreground: "Primary text color",
    fullStandings: "Full standings",
    language: "Language",
    lezgo: "LezGo",
    light: "Light",
    liveScore: "Live score",
    losses: "Losses",
    matches: "Matches",
    matchesInActiveRound: "Matches in active round",
    matchPoints: "Match points",
    mostMatchPoints: "Most match points",
    mostScorePoints: "Most score points",
    name: "Name",
    newTournamentDescription: "Create a tournament with format, players, courts, rounds and ranking settings.",
    newTournamentTitle: "New tournament",
    next: "Next",
    numberOfScorePoints: "Number of score points",
    oneNamePerLine: "One name per line",
    players: "Players",
    playByTime: "Play by time",
    playToScorePoints: "Play to score points",
    position: "Position",
    previous: "Previous",
    primaryButtonColor: "Primary button color",
    rankingSort: "Sort standings by",
    ready: "Ready",
    resetTheme: "Reset theme",
    round: "Round",
    roundComplete: "The round has been fully scored.",
    roundIncomplete: "All matches must be saved before the next round.",
    rounds: "Rounds",
    saveSettings: "Save settings",
    scoring: "Scoring",
    scorePoints: "Score points",
    fixedPartnerAmericano: "Fixed Partner Americano",
    fixedPartnerMexicano: "Fixed Partner Mexicano",
    fixedScore: "Fixed score",
    format: "Format",
    finalPlacements: "Final placements",
    homeNewTournamentDescription: "Choose format, settings and players.",
    homeSettingsDescription: "Only the essential options.",
    homeTemplatesDescription: "Create, edit, delete or start from a template.",
    homeTemplatesTitle: "Tournament templates",
    homeTournamentsDescription: "Active, upcoming, completed and previous tournaments.",
    loadingSettings: "Loading settings...",
    loadingTemplates: "Loading templates...",
    loadingTournament: "Loading tournament...",
    loadingTournaments: "Loading tournaments...",
    loadingShare: "Loading sharing...",
    resumeTimer: "Resume timer",
    savedInRound: "Saved this round",
    registerScorePoints: "Enter score points",
    linkCopied: "Link copied.",
    noActiveTournaments: "No active tournaments.",
    noCompletedTournaments: "No completed tournaments yet.",
    openLive: "Open live",
    openQr: "Open QR",
    openTeamMatch: "Open team match",
    openTvScreen: "Open TV screen",
    review: "Review",
    save: "Save",
    seeFinalStandings: "See final standings",
    secondaryButtonColor: "Secondary button color",
    settingsSaved: "Settings saved.",
    settings: "Settings",
    settingsDescription: "Defaults used automatically for new tournaments.",
    standardsForNewTournaments: "Defaults for new tournaments",
    startTournament: "Start tournament",
    startTemplate: "Start",
    templates: "Templates",
    templatesDescription: "Create, edit, delete and start from templates.",
    team: "Team",
    teams: "Teams",
    timeLimitMinutes: "Playing time (minutes)",
    timeFreeScoring: "Time (free scoring)",
    totalScorePoints: "Total score points",
    totalScorePointsCount: "Total score points",
    tournaments: "Tournaments",
    tournamentsDescription: "Active and completed tournaments are saved locally.",
    tournamentFormat: "Tournament format",
    tournamentSettings: "Tournament settings",
    shareTournament: "Share tournament",
    startTimer: "Start timer",
    stopTimer: "Stop timer",
    surface: "Card background",
    testSound: "Test sound",
    theme: "Theme",
    themeAccent: "Accent color",
    themeCustom: "Custom",
    themePreset: "Theme",
    timerReset: "Reset timer",
    timerStartsAfterCountdown: "15 second countdown before the timer starts.",
    timerStoppedCanResume: "The timer is paused and will continue from the shown time.",
    tvMirror: "TV / Mirror",
    wins: "Wins",
  },
};

export function translate(language: AppLanguage, key: TranslationKey): string {
  return translations[language][key];
}

export function normalizeLanguage(language: unknown): AppLanguage {
  return language === "en" ? "en" : "da";
}
