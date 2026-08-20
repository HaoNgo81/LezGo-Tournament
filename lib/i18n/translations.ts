export type AppLanguage = "da" | "en";

export type TranslationKey =
  | "activeTournament"
  | "active"
  | "account"
  | "accountAlreadyHaveLogin"
  | "accountBackToLogin"
  | "accountCode"
  | "accountCodeCouldNotReset"
  | "accountCodeMismatch"
  | "accountCodeReset"
  | "accountContinue"
  | "accountCreateAccount"
  | "accountCreateOrLogin"
  | "accountCreateSubmit"
  | "accountCreated"
  | "accountCreateError"
  | "accountEmail"
  | "accountEmailNotVerified"
  | "accountEmailVerificationFailed"
  | "accountEmailVerifiedMessage"
  | "accountForgotCode"
  | "accountForgotCodeHelp"
  | "accountGenericRecovery"
  | "accountHideCode"
  | "accountIdentifier"
  | "accountLogin"
  | "accountLoginError"
  | "accountNewCode"
  | "accountLoggedIn"
  | "accountLoggedOut"
  | "accountName"
  | "accountOtpCouldNotSend"
  | "accountOtpCouldNotVerify"
  | "accountOtpHelp"
  | "accountOtpSent"
  | "accountNoOwnTournaments"
  | "accountOpenTournament"
  | "accountOwnTournaments"
  | "accountRepeatCode"
  | "accountResendVerification"
  | "accountSaveNewCode"
  | "accountSendInstructions"
  | "accountShowCode"
  | "accountSignedIn"
  | "accountTournamentOpenError"
  | "accountUsername"
  | "accountVerificationEmailResent"
  | "accountVerificationEmailSent"
  | "accountVerificationResendError"
  | "accountVerificationCode"
  | "accountVerify"
  | "accountVerifyEmailBody"
  | "accountVerifyEmailTitle"
  | "admin"
  | "adminAccessDenied"
  | "adminDescription"
  | "adminTitle"
  | "alarmSound"
  | "allCourts"
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
  | "darkGold"
  | "draws"
  | "edit"
  | "editScore"
  | "editTemplate"
  | "delete"
  | "enterScore"
  | "finishTournament"
  | "finalStandings"
  | "forest"
  | "foreground"
  | "fullStandings"
  | "language"
  | "liveTournamentDescription"
  | "liveTournamentTitle"
  | "lezgo"
  | "light"
  | "liveScore"
  | "losses"
  | "matches"
  | "matchesInActiveRound"
  | "matchPoints"
  | "midnight"
  | "mostMatchPoints"
  | "mostScorePoints"
  | "moreActions"
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
  | "formatAmericano"
  | "formatMexicano"
  | "formatMixedAmericano"
  | "formatPoolPlay"
  | "finalPlacements"
  | "homeNewTournamentDescription"
  | "homeSettingsDescription"
  | "homeTemplatesDescription"
  | "homeTemplatesTitle"
  | "homeTournamentsDescription"
  | "hybridLezgo"
  | "loadingSettings"
  | "loadingTemplates"
  | "loadingTournament"
  | "loadingTournaments"
  | "loadingShare"
  | "logout"
  | "resumeTimer"
  | "savedInRound"
  | "savedShort"
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
  | "ocean"
  | "ownerScoreConflictMessage"
  | "review"
  | "retry"
  | "remoteAccessDenied"
  | "remoteAccessHelp"
  | "remoteAccessInfo"
  | "remoteAccessOnlyInitialToken"
  | "remoteAccessReady"
  | "remoteAccessRevoked"
  | "remoteActivateSharing"
  | "remoteAutomaticAdvance"
  | "remoteAutoSyncError"
  | "remoteCloseView"
  | "remoteCodeCopied"
  | "remoteCopy"
  | "remoteConnectionExpired"
  | "remoteCurrentMatches"
  | "remoteFetchError"
  | "remoteFullscreen"
  | "remoteGenerateNewQr"
  | "remoteGenerateNewAccessCode"
  | "remoteHandoffDenied"
  | "remoteHandoffExpired"
  | "remoteHandoffLinkCopied"
  | "remoteHandoffOpening"
  | "remoteHideToken"
  | "remoteLatestLoaded"
  | "remoteLoadingTournament"
  | "remoteNewConnection"
  | "remoteNoSavedLineup"
  | "remoteNotSaved"
  | "remoteNextMatch"
  | "remoteNextMatches"
  | "remoteNextPhase"
  | "remotePausedPlayers"
  | "remotePoolStandings"
  | "remotePlacementTiebreak"
  | "remoteQrFuture"
  | "remoteQrAlt"
  | "remoteQrExpiresAt"
  | "remoteQrHelp"
  | "remoteQrReady"
  | "remoteQrValidTenMinutes"
  | "remoteReadOnlyBanner"
  | "remoteReadOnlyHelp"
  | "remoteReadOnlyShort"
  | "remoteScoreEntryBanner"
  | "remoteScoreEntryShort"
  | "remoteScoreEntryAccess"
  | "remoteScoreEntryLink"
  | "remoteScoreEntryWarning"
  | "remoteScoreAutomatic"
  | "remoteScoreConflictError"
  | "remoteScoreNetworkError"
  | "remoteScoreSave"
  | "remoteScoreSaveError"
  | "remoteScoreSaving"
  | "remoteRefresh"
  | "remoteShareToken"
  | "remoteShareTokenCopied"
  | "remoteShareUnifiedHelp"
  | "remoteSharingNotEnabled"
  | "remoteShowToken"
  | "remoteSessionDenied"
  | "remoteSessionExpired"
  | "remoteScoreboardMode"
  | "remoteStandardMode"
  | "remoteSyncConnecting"
  | "remoteSyncError"
  | "remoteSyncLastChecked"
  | "remoteSyncLastUpdated"
  | "remoteSyncLive"
  | "remoteSyncNextRetry"
  | "remoteSyncOffline"
  | "remoteSyncReconnecting"
  | "remoteSyncRestoring"
  | "remoteSyncStatus"
  | "remoteTopStandings"
  | "remoteTokenOnlyShownOnce"
  | "remoteTournamentCode"
  | "remoteTournamentOpened"
  | "remoteTeamsAndCaptains"
  | "remoteTvMode"
  | "remoteTvLiveScore"
  | "remoteTvReadOnlyHelp"
  | "remoteUnifiedShareTitle"
  | "remoteOrganizerSyncRequired"
  | "remoteRevokeAccess"
  | "remoteViewOnAnotherDevice"
  | "resultFinalResult"
  | "resultCompletedReadOnly"
  | "resultGroup"
  | "resultPairPlayers"
  | "resultPublicLink"
  | "resultQrAlt"
  | "resultQrHelp"
  | "resultReadOnlyHelp"
  | "resultShareButton"
  | "resultShareError"
  | "resultShareHelp"
  | "resultShareReady"
  | "resultShareSyncRequired"
  | "resultShareTitle"
  | "resultShowQr"
  | "resultSortedBy"
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
  | "shareShort"
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
  | "tvShort"
  | "accessShort"
  | "wins";

export const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
  da: {
    activeTournament: "Aktiv turnering",
    active: "Aktive",
    account: "Konto",
    accountAlreadyHaveLogin: "Har du allerede en bruger? Log ind",
    accountBackToLogin: "Tilbage til log ind",
    accountCode: "6-tegns kode",
    accountCodeCouldNotReset: "Koden kunne ikke gemmes.",
    accountCodeMismatch: "Koderne er ikke ens.",
    accountCodeReset: "Den nye kode er gemt.",
    accountContinue: "Fortsæt",
    accountCreateAccount: "Opret bruger",
    accountCreateOrLogin: "Opret bruger / Log ind",
    accountCreateSubmit: "Opret bruger",
    accountCreated: "Brugeren er oprettet. Log ind med email eller brugernavn og din kode.",
    accountCreateError: "Brugeren kunne ikke oprettes.",
    accountEmail: "E-mail",
    accountEmailNotVerified: "Din e-mail er ikke bekræftet endnu. Tjek din indbakke.",
    accountEmailVerificationFailed: "E-mailen kunne ikke bekræftes. Prøv linket igen, eller send en ny mail.",
    accountEmailVerifiedMessage: "E-mail bekræftet. Din konto er nu aktiveret. Du kan logge ind.",
    accountForgotCode: "Glemt kode",
    accountForgotCodeHelp: "Indtast den email, der er tilknyttet din konto.",
    accountGenericRecovery: "Hvis emailen er tilknyttet en konto, har vi sendt en mail med instruktioner.",
    accountHideCode: "Skjul kode",
    accountIdentifier: "Email eller brugernavn",
    accountLogin: "Log ind",
    accountLoginError: "Email/brugernavn eller kode er forkert.",
    accountNewCode: "Ny 6-tegns kode",
    accountLoggedIn: "Du er logget ind.",
    accountLoggedOut: "Du er logget ud.",
    accountName: "Navn",
    accountOtpCouldNotSend: "Login-koden kunne ikke sendes.",
    accountOtpCouldNotVerify: "Login-koden kunne ikke bekræftes.",
    accountOtpHelp: "Indtast navn og e-mail. Vi sender en Supabase-verifikationskode til e-mailen.",
    accountOtpSent: "Tjek din e-mail og indtast verifikationskoden.",
    accountNoOwnTournaments: "Ingen private Supabase-turneringer endnu.",
    accountOpenTournament: "Åbn turnering",
    accountOwnTournaments: "Mine turneringer",
    accountRepeatCode: "Gentag kode",
    accountResendVerification: "Send mail igen",
    accountSaveNewCode: "Gem ny kode",
    accountSendInstructions: "Send vejledning",
    accountShowCode: "Vis kode",
    accountSignedIn: "Logget ind",
    accountTournamentOpenError: "Turneringen kunne ikke åbnes fra Supabase.",
    accountUsername: "Brugernavn",
    accountVerificationEmailResent: "Hvis e-mailen kan bekræftes, har vi sendt en ny mail.",
    accountVerificationEmailSent: "Vi har sendt et bekræftelseslink til din e-mail.",
    accountVerificationResendError: "Bekræftelsesmailen kunne ikke sendes lige nu.",
    accountVerificationCode: "Verifikationskode",
    accountVerify: "Bekræft",
    accountVerifyEmailBody: "Vi har sendt et bekræftelseslink til din e-mail. Åbn mailen og tryk på linket for at aktivere din konto.",
    accountVerifyEmailTitle: "Bekræft din e-mail",
    admin: "Admin",
    adminAccessDenied: "Admin-adgang blev afvist.",
    adminDescription: "Beskyttet område for systemadministration.",
    adminTitle: "Admin",
    alarmSound: "Alarmlyd",
    allCourts: "Alle baner",
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
    darkGold: "Dark Gold",
    draws: "Uafgjort",
    edit: "Rediger",
    editScore: "Rediger score",
    editTemplate: "Rediger skabelon",
    delete: "Slet",
    enterScore: "Indtast score",
    finishTournament: "Afslut turnering",
    finalStandings: "Slutstilling",
    forest: "Forest",
    foreground: "Primær tekstfarve",
    fullStandings: "Hele stillingen",
    language: "Sprog",
    liveTournamentDescription: "En skærm til runde, kampe, scoring og stilling.",
    liveTournamentTitle: "Live turnering",
    lezgo: "LezGo",
    light: "Lys",
    hybridLezgo: "HYBRID LEZGO",
    liveScore: "Live score",
    losses: "Tab",
    matches: "Kampe",
    matchesInActiveRound: "Kampe i aktiv runde",
    matchPoints: "Matchpoint",
    midnight: "Midnight",
    mostMatchPoints: "Flest matchpoint",
    mostScorePoints: "Flest scorepoint",
    moreActions: "Flere handlinger",
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
    formatAmericano: "Americano",
    formatMexicano: "Mexicano",
    formatMixedAmericano: "Mixed Americano",
    formatPoolPlay: "Puljespil",
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
    logout: "Log ud",
    resumeTimer: "Fortsæt ur",
    savedInRound: "Gemt i runden",
    savedShort: "Gemt",
    registerScorePoints: "Registrer scorepoint",
    linkCopied: "Link kopieret.",
    noActiveTournaments: "Ingen aktive turneringer.",
    noCompletedTournaments: "Ingen afsluttede turneringer endnu.",
    openLive: "Åbn live",
    openRemoteTournament: "Åbn turnering fra anden enhed",
    openRemoteTournamentDescription: "Indtast turneringskode og 4-cifret adgangskode for scoreindtastning.",
    openQr: "Åbn QR",
    openTeamMatch: "Åbn holdkamp",
    openTvScreen: "Åbn TV-skærm",
    ocean: "Ocean",
    ownerScoreConflictMessage: "Scoren er blevet ændret på en anden enhed. Den nyeste score er indlæst.",
    review: "Gennemse",
    retry: "Prøv igen",
    remoteAccessDenied: "Turneringen kunne ikke åbnes. Kontrollér kode og adgangskode.",
    remoteAccessHelp: "Indtast koden og adgangskoden fra en turnering, der allerede er delt fra en anden enhed.",
    remoteAccessInfo: "Adgang til anden enhed",
    remoteAccessOnlyInitialToken: "Adgangskoden vises kun, når adgangen oprettes. Gem den sikkert uden for appen.",
    remoteAccessReady: "Adgang oprettet.",
    remoteAccessRevoked: "Remote scoreadgang er lukket.",
    remoteActivateSharing: "Aktivér deling",
    remoteAutomaticAdvance: "Automatisk videre",
    remoteAutoSyncError: "Live-opdatering kunne ikke hente nyeste version. Seneste viste turnering er bevaret.",
    remoteCloseView: "Luk visning",
    remoteCodeCopied: "Turneringskode kopieret.",
    remoteCopy: "Kopiér",
    remoteConnectionExpired: "TV-forbindelsen er udløbet eller ikke længere gyldig.",
    remoteCurrentMatches: "Kampe",
    remoteFetchError: "Forbindelsen kunne ikke opdateres. Seneste viste turnering er bevaret.",
    remoteFullscreen: "Fuld skærm",
    remoteGenerateNewQr: "Generér ny QR-kode",
    remoteGenerateNewAccessCode: "Generér ny adgangskode",
    remoteHandoffDenied: "QR-linket kunne ikke åbnes. Bed turneringslederen om at generere en ny QR-kode.",
    remoteHandoffExpired: "QR-koden er udløbet. Bed turneringslederen om at generere en ny.",
    remoteHandoffLinkCopied: "QR-link kopieret.",
    remoteHandoffOpening: "Åbner skrivebeskyttet turnering...",
    remoteHideToken: "Skjul",
    remoteLatestLoaded: "Seneste version er hentet.",
    remoteLoadingTournament: "Henter turnering...",
    remoteNewConnection: "Ny forbindelse",
    remoteNoSavedLineup: "Opstilling er ikke gemt endnu.",
    remoteNotSaved: "Ikke gemt",
    remoteNextMatch: "Næste kamp",
    remoteNextMatches: "Næste kampe",
    remoteNextPhase: "Næste fase",
    remotePausedPlayers: "Pause",
    remotePoolStandings: "Puljestillinger",
    remotePlacementTiebreak: "Tiebreak om placering",
    remoteQrAlt: "QR-kode til skrivebeskyttet turnering",
    remoteQrExpiresAt: "Udløber",
    remoteQrFuture: "QR-handoff kan senere bruge samme kode og en sikker engangsreference uden at gemme adgangskoden i databasen.",
    remoteQrHelp: "Scan QR-koden med en anden enhed for at åbne turneringen.",
    remoteQrReady: "QR-kode klar.",
    remoteQrValidTenMinutes: "QR-linket er gyldigt i cirka 10 minutter og kan bruges igen indtil udløb.",
    remoteReadOnlyBanner: "Visning fra anden enhed - skrivebeskyttet",
    remoteReadOnlyHelp: "Du kan se live score og stilling, men denne visning kan ikke gemme, redigere eller overskrive lokale turneringer.",
    remoteReadOnlyShort: "Skrivebeskyttet",
    remoteScoreEntryBanner: "Visning fra anden enhed - scoreindtastning aktiv",
    remoteScoreEntryShort: "Score aktiv",
    remoteScoreEntryAccess: "Scoreindtastning",
    remoteScoreEntryLink: "Link til scoreindtastning",
    remoteScoreEntryWarning: "Del kun denne kode med personer, der må ændre kampresultater.",
    remoteScoreAutomatic: "Automatisk",
    remoteScoreConflictError: "Resultatet er blevet ændret fra en anden enhed. Hent seneste version og prøv igen.",
    remoteScoreNetworkError: "Forbindelsen blev afbrudt. Prøv igen.",
    remoteScoreSave: "Gem score",
    remoteScoreSaveError: "Kunne ikke gemme score. Prøv igen.",
    remoteScoreSaving: "Gemmer...",
    remoteRefresh: "Opdater",
    remoteShareToken: "Adgangskode",
    remoteShareTokenCopied: "Adgangskode kopieret.",
    remoteShareUnifiedHelp: "Opret scoreindtastning til en telefon/tablet eller en skrivebeskyttet TV/livescore-visning.",
    remoteSharingNotEnabled: "Supabase-deling er ikke slået til i dette miljø.",
    remoteShowToken: "Vis",
    remoteSessionDenied: "Remote-sessionen er ikke længere gyldig. Generér en ny QR-kode eller åbn en ny forbindelse.",
    remoteSessionExpired: "Remote-sessionen er udløbet. Generér en ny QR-kode eller åbn en ny forbindelse.",
    remoteScoreboardMode: "Scoreboard-visning",
    remoteStandardMode: "Standardvisning",
    remoteSyncConnecting: "Forbinder",
    remoteSyncError: "Fejl",
    remoteSyncLastChecked: "Senest tjekket",
    remoteSyncLastUpdated: "Senest opdateret",
    remoteSyncLive: "Live",
    remoteSyncNextRetry: "Næste forsøg",
    remoteSyncOffline: "Offline",
    remoteSyncReconnecting: "Forbinder igen",
    remoteSyncRestoring: "Genopretter forbindelse...",
    remoteSyncStatus: "Live-sync status",
    remoteTopStandings: "Stilling",
    remoteTokenOnlyShownOnce: "Adgangskoden kunne ikke vises igen. Opret en ny adgang senere, hvis den er væk.",
    remoteTournamentCode: "Turneringskode",
    remoteTournamentOpened: "Turnering åbnet.",
    remoteTeamsAndCaptains: "Hold og kaptajner",
    remoteTvMode: "TV-visning",
    remoteTvLiveScore: "TV / Livescore",
    remoteTvReadOnlyHelp: "Scan QR-koden på TV/tablet for at åbne en skrivebeskyttet livescore-visning.",
    remoteUnifiedShareTitle: "Del / vis på anden enhed",
    remoteOrganizerSyncRequired: "Gem/synkroniser turneringen fra hovedenheden, før adgang kan oprettes.",
    remoteRevokeAccess: "Luk scoreadgang",
    remoteViewOnAnotherDevice: "Vis på anden enhed",
    resultFinalResult: "Slutresultat",
    resultCompletedReadOnly: "Turneringen er afsluttet · Skrivebeskyttet",
    resultGroup: "Gruppe",
    resultPairPlayers: "Par / spillere",
    resultPublicLink: "Offentligt resultatlink",
    resultQrAlt: "QR-kode til offentligt slutresultat",
    resultQrHelp: "Scan QR-koden med en anden enhed for at åbne slutresultatet.",
    resultReadOnlyHelp: "Resultatsiden er offentlig og skrivebeskyttet. Den kan ikke redigere score eller turnering.",
    resultShareButton: "Del resultat",
    resultShareError: "Resultatet kunne ikke deles. Prøv igen.",
    resultShareHelp: "Opret et offentligt skrivebeskyttet link og QR-kode til den endelige stilling.",
    resultShareReady: "Resultatlink klar.",
    resultShareSyncRequired: "Synkronisering kræves, før resultatet kan deles på andre enheder.",
    resultShareTitle: "Del resultat",
    resultShowQr: "Vis QR",
    resultSortedBy: "Sorteret efter",
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
    shareShort: "Del",
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
    tvShort: "TV",
    accessShort: "Adgang",
    wins: "Sejre",
  },
  en: {
    activeTournament: "Active tournament",
    active: "Active",
    account: "Account",
    accountAlreadyHaveLogin: "Already have an account? Log in",
    accountBackToLogin: "Back to log in",
    accountCode: "6-character code",
    accountCodeCouldNotReset: "The code could not be saved.",
    accountCodeMismatch: "The codes do not match.",
    accountCodeReset: "The new code has been saved.",
    accountContinue: "Continue",
    accountCreateAccount: "Create account",
    accountCreateOrLogin: "Create account / Log in",
    accountCreateSubmit: "Create account",
    accountCreated: "The account has been created. Log in with email or username and your code.",
    accountCreateError: "The account could not be created.",
    accountEmail: "Email",
    accountEmailNotVerified: "Your email is not verified yet. Check your inbox.",
    accountEmailVerificationFailed: "The email could not be verified. Try the link again or send a new email.",
    accountEmailVerifiedMessage: "Email verified. Your account is now active. You can log in.",
    accountForgotCode: "Forgot code",
    accountForgotCodeHelp: "Enter the email linked to your account.",
    accountGenericRecovery: "If the email is linked to an account, we have sent recovery instructions.",
    accountHideCode: "Hide code",
    accountIdentifier: "Email or username",
    accountLogin: "Log in",
    accountLoginError: "Email/username or code is incorrect.",
    accountNewCode: "New 6-character code",
    accountLoggedIn: "You are logged in.",
    accountLoggedOut: "You are logged out.",
    accountName: "Name",
    accountOtpCouldNotSend: "The login code could not be sent.",
    accountOtpCouldNotVerify: "The login code could not be verified.",
    accountOtpHelp: "Enter name and email. We send a Supabase verification code to the email address.",
    accountOtpSent: "Check your email and enter the verification code.",
    accountNoOwnTournaments: "No private Supabase tournaments yet.",
    accountOpenTournament: "Open tournament",
    accountOwnTournaments: "My tournaments",
    accountRepeatCode: "Repeat code",
    accountResendVerification: "Send email again",
    accountSaveNewCode: "Save new code",
    accountSendInstructions: "Send instructions",
    accountShowCode: "Show code",
    accountSignedIn: "Signed in",
    accountTournamentOpenError: "The tournament could not be opened from Supabase.",
    accountUsername: "Username",
    accountVerificationEmailResent: "If the email can be verified, we have sent a new email.",
    accountVerificationEmailSent: "We have sent a verification link to your email.",
    accountVerificationResendError: "The verification email could not be sent right now.",
    accountVerificationCode: "Verification code",
    accountVerify: "Verify",
    accountVerifyEmailBody: "We have sent a verification link to your email. Open the email and press the link to activate your account.",
    accountVerifyEmailTitle: "Verify your email",
    admin: "Admin",
    adminAccessDenied: "Admin access was denied.",
    adminDescription: "Protected area for system administration.",
    adminTitle: "Admin",
    alarmSound: "Alarm sound",
    allCourts: "All courts",
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
    darkGold: "Dark Gold",
    draws: "Draws",
    edit: "Edit",
    editScore: "Edit score",
    editTemplate: "Edit template",
    delete: "Delete",
    enterScore: "Enter score",
    finishTournament: "Finish tournament",
    finalStandings: "Final standings",
    forest: "Forest",
    foreground: "Primary text color",
    fullStandings: "Full standings",
    language: "Language",
    liveTournamentDescription: "One screen for rounds, matches, scoring and standings.",
    liveTournamentTitle: "Live tournament",
    lezgo: "LezGo",
    light: "Light",
    hybridLezgo: "HYBRID LEZGO",
    liveScore: "Live score",
    losses: "Losses",
    matches: "Matches",
    matchesInActiveRound: "Matches in active round",
    matchPoints: "Match points",
    midnight: "Midnight",
    mostMatchPoints: "Most match points",
    mostScorePoints: "Most score points",
    moreActions: "More actions",
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
    formatAmericano: "Americano",
    formatMexicano: "Mexicano",
    formatMixedAmericano: "Mixed Americano",
    formatPoolPlay: "Pool Play",
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
    logout: "Log out",
    resumeTimer: "Resume timer",
    savedInRound: "Saved this round",
    savedShort: "Saved",
    registerScorePoints: "Enter score points",
    linkCopied: "Link copied.",
    noActiveTournaments: "No active tournaments.",
    noCompletedTournaments: "No completed tournaments yet.",
    openLive: "Open live",
    openRemoteTournament: "Open tournament from another device",
    openRemoteTournamentDescription: "Enter the tournament code and 4-digit access code for score entry.",
    openQr: "Open QR",
    openTeamMatch: "Open team match",
    openTvScreen: "Open TV screen",
    ocean: "Ocean",
    ownerScoreConflictMessage: "The score was changed on another device. The latest score has been loaded.",
    review: "Review",
    retry: "Try again",
    remoteAccessDenied: "The tournament could not be opened. Check the code and access code.",
    remoteAccessHelp: "Enter the code and 4-digit access code from a tournament already shared from another device.",
    remoteAccessInfo: "Access for another device",
    remoteAccessOnlyInitialToken: "The access code is only shown when access is created. Store it safely outside the app.",
    remoteAccessReady: "Access created.",
    remoteAccessRevoked: "Remote score access has been closed.",
    remoteActivateSharing: "Activate sharing",
    remoteAutomaticAdvance: "Automatic advance",
    remoteAutoSyncError: "Live sync could not fetch the latest version. The last shown tournament is kept.",
    remoteCloseView: "Close view",
    remoteCodeCopied: "Tournament code copied.",
    remoteCopy: "Copy",
    remoteConnectionExpired: "The TV connection has expired or is no longer valid.",
    remoteCurrentMatches: "Matches",
    remoteFetchError: "The connection could not refresh. The last shown tournament is kept.",
    remoteFullscreen: "Fullscreen",
    remoteGenerateNewQr: "Generate new QR code",
    remoteGenerateNewAccessCode: "Generate new access code",
    remoteHandoffDenied: "The QR link could not be opened. Ask the tournament organizer to generate a new QR code.",
    remoteHandoffExpired: "This QR code has expired. Ask the tournament organizer to generate a new one.",
    remoteHandoffLinkCopied: "QR link copied.",
    remoteHandoffOpening: "Opening read-only tournament...",
    remoteHideToken: "Hide",
    remoteLatestLoaded: "Latest version loaded.",
    remoteLoadingTournament: "Loading tournament...",
    remoteNewConnection: "New connection",
    remoteNoSavedLineup: "Lineup has not been saved yet.",
    remoteNotSaved: "Not saved",
    remoteNextMatch: "Next match",
    remoteNextMatches: "Next matches",
    remoteNextPhase: "Next phase",
    remotePausedPlayers: "Pause",
    remotePoolStandings: "Pool standings",
    remotePlacementTiebreak: "Placement tiebreak",
    remoteQrAlt: "QR code for read-only tournament",
    remoteQrExpiresAt: "Expires",
    remoteQrFuture: "A later QR handoff can use the same code and a secure one-time reference without storing the access code in the database.",
    remoteQrHelp: "Scan the QR code with another device to open the tournament.",
    remoteQrReady: "QR code ready.",
    remoteQrValidTenMinutes: "The QR link is valid for about 10 minutes and can be reused until it expires.",
    remoteReadOnlyBanner: "Opened from another device - read only",
    remoteReadOnlyHelp: "You can view live score and standings, but this view cannot save, edit or overwrite local tournaments.",
    remoteReadOnlyShort: "Read only",
    remoteScoreEntryBanner: "Opened from another device - score entry active",
    remoteScoreEntryShort: "Score active",
    remoteScoreEntryAccess: "Score entry",
    remoteScoreEntryLink: "Score entry link",
    remoteScoreEntryWarning: "Only share this code with people who may change match scores.",
    remoteScoreAutomatic: "Automatic",
    remoteScoreConflictError: "The result was changed from another device. Load the latest version and try again.",
    remoteScoreNetworkError: "The connection was interrupted. Try again.",
    remoteScoreSave: "Save score",
    remoteScoreSaveError: "Could not save score. Try again.",
    remoteScoreSaving: "Saving...",
    remoteRefresh: "Refresh",
    remoteShareToken: "Access code",
    remoteShareTokenCopied: "Access code copied.",
    remoteShareUnifiedHelp: "Create score entry for a phone/tablet or a read-only TV/live score view.",
    remoteSharingNotEnabled: "Supabase sharing is not enabled in this environment.",
    remoteShowToken: "Show",
    remoteSessionDenied: "The remote session is no longer valid. Generate a new QR code or open a new connection.",
    remoteSessionExpired: "The remote session has expired. Generate a new QR code or open a new connection.",
    remoteScoreboardMode: "Scoreboard View",
    remoteStandardMode: "Standard view",
    remoteSyncConnecting: "Connecting",
    remoteSyncError: "Error",
    remoteSyncLastChecked: "Last checked",
    remoteSyncLastUpdated: "Last updated",
    remoteSyncLive: "Live",
    remoteSyncNextRetry: "Next retry",
    remoteSyncOffline: "Offline",
    remoteSyncReconnecting: "Reconnecting",
    remoteSyncRestoring: "Reconnecting...",
    remoteSyncStatus: "Live sync status",
    remoteTopStandings: "Standings",
    remoteTokenOnlyShownOnce: "The access code cannot be shown again. Create new access later if it is lost.",
    remoteTournamentCode: "Tournament code",
    remoteTournamentOpened: "Tournament opened.",
    remoteTeamsAndCaptains: "Teams and captains",
    remoteTvMode: "TV View",
    remoteTvLiveScore: "TV / Live score",
    remoteTvReadOnlyHelp: "Scan the QR code on a TV/tablet to open a read-only live score view.",
    remoteUnifiedShareTitle: "Share / show on another device",
    remoteOrganizerSyncRequired: "Save/sync the tournament from the main device before creating access.",
    remoteRevokeAccess: "Close score access",
    remoteViewOnAnotherDevice: "View on another device",
    resultFinalResult: "Final result",
    resultCompletedReadOnly: "Tournament completed · Read only",
    resultGroup: "Group",
    resultPairPlayers: "Pair / players",
    resultPublicLink: "Public result link",
    resultQrAlt: "QR code for public final result",
    resultQrHelp: "Scan the QR code with another device to open the final result.",
    resultReadOnlyHelp: "The result page is public and read only. It cannot edit scores or the tournament.",
    resultShareButton: "Share result",
    resultShareError: "The result could not be shared. Try again.",
    resultShareHelp: "Create a public read-only link and QR code for the final standings.",
    resultShareReady: "Result link ready.",
    resultShareSyncRequired: "Synchronization is required before the result can be shared on other devices.",
    resultShareTitle: "Share result",
    resultShowQr: "Show QR",
    resultSortedBy: "Sorted by",
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
    shareShort: "Share",
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
    tvShort: "TV",
    accessShort: "Access",
    wins: "Wins",
  },
};

export function translate(language: AppLanguage, key: TranslationKey): string {
  return translations[language][key];
}

export function normalizeLanguage(language: unknown): AppLanguage {
  return language === "en" ? "en" : "da";
}
