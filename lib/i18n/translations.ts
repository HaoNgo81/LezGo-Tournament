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
  | "openRemoteTournament"
  | "openRemoteTournamentDescription"
  | "openQr"
  | "openTeamMatch"
  | "openTvScreen"
  | "review"
  | "remoteAccessDenied"
  | "remoteAccessHelp"
  | "remoteAccessInfo"
  | "remoteAccessOnlyInitialToken"
  | "remoteAccessReady"
  | "remoteAutomaticAdvance"
  | "remoteAutoSyncError"
  | "remoteCloseView"
  | "remoteCodeCopied"
  | "remoteCopy"
  | "remoteFetchError"
  | "remoteGenerateNewQr"
  | "remoteHandoffDenied"
  | "remoteHandoffExpired"
  | "remoteHandoffLinkCopied"
  | "remoteHandoffOpening"
  | "remoteHideToken"
  | "remoteLatestLoaded"
  | "remoteLoadingTournament"
  | "remoteNoSavedLineup"
  | "remoteNextPhase"
  | "remotePausedPlayers"
  | "remotePoolStandings"
  | "remotePlacementTiebreak"
  | "remoteQrFuture"
  | "remoteQrAlt"
  | "remoteQrExpiresAt"
  | "remoteQrHelp"
  | "remoteQrReady"
  | "remoteReadOnlyBanner"
  | "remoteReadOnlyHelp"
  | "remoteRefresh"
  | "remoteShareToken"
  | "remoteShareTokenCopied"
  | "remoteShowToken"
  | "remoteSyncConnecting"
  | "remoteSyncError"
  | "remoteSyncLive"
  | "remoteSyncOffline"
  | "remoteSyncReconnecting"
  | "remoteSyncStatus"
  | "remoteTokenOnlyShownOnce"
  | "remoteTournamentCode"
  | "remoteTournamentOpened"
  | "remoteTeamsAndCaptains"
  | "remoteViewOnAnotherDevice"
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
    openRemoteTournament: "Åbn turnering fra anden enhed",
    openRemoteTournamentDescription: "Indtast turneringskode og adgangskode til en skrivebeskyttet visning.",
    openQr: "Åbn QR",
    openTeamMatch: "Åbn holdkamp",
    openTvScreen: "Åbn TV-skærm",
    review: "Gennemse",
    remoteAccessDenied: "Turneringen kunne ikke åbnes. Kontrollér kode og adgangskode.",
    remoteAccessHelp: "Indtast koden og adgangskoden fra en turnering, der allerede er delt fra en anden enhed.",
    remoteAccessInfo: "Adgang til anden enhed",
    remoteAccessOnlyInitialToken: "Adgangskoden vises kun, når adgangen oprettes. Gem den sikkert uden for appen.",
    remoteAccessReady: "Adgang oprettet.",
    remoteAutomaticAdvance: "Automatisk videre",
    remoteAutoSyncError: "Live-opdatering kunne ikke hente nyeste version. Seneste viste turnering er bevaret.",
    remoteCloseView: "Luk visning",
    remoteCodeCopied: "Turneringskode kopieret.",
    remoteCopy: "Kopiér",
    remoteFetchError: "Forbindelsen kunne ikke opdateres. Seneste viste turnering er bevaret.",
    remoteGenerateNewQr: "Generér ny QR-kode",
    remoteHandoffDenied: "QR-linket kunne ikke åbnes. Bed turneringslederen om at generere en ny QR-kode.",
    remoteHandoffExpired: "QR-koden er udløbet. Bed turneringslederen om at generere en ny.",
    remoteHandoffLinkCopied: "QR-link kopieret.",
    remoteHandoffOpening: "Åbner skrivebeskyttet turnering...",
    remoteHideToken: "Skjul",
    remoteLatestLoaded: "Seneste version er hentet.",
    remoteLoadingTournament: "Henter turnering...",
    remoteNoSavedLineup: "Opstilling er ikke gemt endnu.",
    remoteNextPhase: "Næste fase",
    remotePausedPlayers: "Pause",
    remotePoolStandings: "Puljestillinger",
    remotePlacementTiebreak: "Tiebreak om placering",
    remoteQrAlt: "QR-kode til skrivebeskyttet turnering",
    remoteQrExpiresAt: "Udløber",
    remoteQrFuture: "QR-handoff kan senere bruge samme kode og en sikker engangsreference uden at gemme adgangskoden i databasen.",
    remoteQrHelp: "Scan QR-koden med en anden enhed for at åbne turneringen.",
    remoteQrReady: "QR-kode klar.",
    remoteReadOnlyBanner: "Visning fra anden enhed - skrivebeskyttet",
    remoteReadOnlyHelp: "Du kan se live score og stilling, men denne visning kan ikke gemme, redigere eller overskrive lokale turneringer.",
    remoteRefresh: "Opdater",
    remoteShareToken: "Adgangskode / Share token",
    remoteShareTokenCopied: "Adgangskode kopieret.",
    remoteShowToken: "Vis",
    remoteSyncConnecting: "Forbinder",
    remoteSyncError: "Fejl",
    remoteSyncLive: "Live",
    remoteSyncOffline: "Offline",
    remoteSyncReconnecting: "Forbinder igen",
    remoteSyncStatus: "Live-sync status",
    remoteTokenOnlyShownOnce: "Adgangskoden kunne ikke vises igen. Opret en ny adgang senere, hvis den er væk.",
    remoteTournamentCode: "Turneringskode",
    remoteTournamentOpened: "Turnering åbnet.",
    remoteTeamsAndCaptains: "Hold og kaptajner",
    remoteViewOnAnotherDevice: "Vis på anden enhed",
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
    openRemoteTournament: "Open tournament from another device",
    openRemoteTournamentDescription: "Enter the tournament code and share token for a read-only view.",
    openQr: "Open QR",
    openTeamMatch: "Open team match",
    openTvScreen: "Open TV screen",
    review: "Review",
    remoteAccessDenied: "The tournament could not be opened. Check the code and share token.",
    remoteAccessHelp: "Enter the code and share token from a tournament already shared from another device.",
    remoteAccessInfo: "Access for another device",
    remoteAccessOnlyInitialToken: "The share token is only shown when access is created. Store it safely outside the app.",
    remoteAccessReady: "Access created.",
    remoteAutomaticAdvance: "Automatic advance",
    remoteAutoSyncError: "Live sync could not fetch the latest version. The last shown tournament is kept.",
    remoteCloseView: "Close view",
    remoteCodeCopied: "Tournament code copied.",
    remoteCopy: "Copy",
    remoteFetchError: "The connection could not refresh. The last shown tournament is kept.",
    remoteGenerateNewQr: "Generate new QR code",
    remoteHandoffDenied: "The QR link could not be opened. Ask the tournament organizer to generate a new QR code.",
    remoteHandoffExpired: "This QR code has expired. Ask the tournament organizer to generate a new one.",
    remoteHandoffLinkCopied: "QR link copied.",
    remoteHandoffOpening: "Opening read-only tournament...",
    remoteHideToken: "Hide",
    remoteLatestLoaded: "Latest version loaded.",
    remoteLoadingTournament: "Loading tournament...",
    remoteNoSavedLineup: "Lineup has not been saved yet.",
    remoteNextPhase: "Next phase",
    remotePausedPlayers: "Pause",
    remotePoolStandings: "Pool standings",
    remotePlacementTiebreak: "Placement tiebreak",
    remoteQrAlt: "QR code for read-only tournament",
    remoteQrExpiresAt: "Expires",
    remoteQrFuture: "A later QR handoff can use the same code and a secure one-time reference without storing the share token in the database.",
    remoteQrHelp: "Scan the QR code with another device to open the tournament.",
    remoteQrReady: "QR code ready.",
    remoteReadOnlyBanner: "Opened from another device - read only",
    remoteReadOnlyHelp: "You can view live score and standings, but this view cannot save, edit or overwrite local tournaments.",
    remoteRefresh: "Refresh",
    remoteShareToken: "Share token",
    remoteShareTokenCopied: "Share token copied.",
    remoteShowToken: "Show",
    remoteSyncConnecting: "Connecting",
    remoteSyncError: "Error",
    remoteSyncLive: "Live",
    remoteSyncOffline: "Offline",
    remoteSyncReconnecting: "Reconnecting",
    remoteSyncStatus: "Live sync status",
    remoteTokenOnlyShownOnce: "The share token cannot be shown again. Create new access later if it is lost.",
    remoteTournamentCode: "Tournament code",
    remoteTournamentOpened: "Tournament opened.",
    remoteTeamsAndCaptains: "Teams and captains",
    remoteViewOnAnotherDevice: "View on another device",
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
