export type AppLanguage = "da" | "en";

export type TranslationKey =
  | "activeTournament"
  | "active"
  | "account"
  | "accountAlreadyHaveLogin"
  | "accountBackToLogin"
  | "accountCode"
  | "accountCodeInvalid"
  | "accountCodeCouldNotReset"
  | "accountCodeMismatch"
  | "accountCodeReset"
  | "accountChangeCode"
  | "accountContinue"
  | "accountCreateAccount"
  | "accountCreateOrLogin"
  | "accountCreateSubmit"
  | "accountCreateTournament"
  | "accountCreated"
  | "accountCreateError"
  | "accountCurrentCode"
  | "accountCurrentSession"
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
  | "accountLoginAdminNotRemembered"
  | "accountLoginError"
  | "accountLogoutOtherDevices"
  | "accountLogoutOtherDevicesConfirm"
  | "accountLogoutOtherDevicesError"
  | "accountLogoutOtherDevicesHelp"
  | "accountLogoutOtherDevicesSuccess"
  | "accountNewCode"
  | "accountRememberLogin"
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
  | "accountRecoveryCodeChanged"
  | "accountRecoveryInvalidLink"
  | "accountResetCodeTitle"
  | "accountResendVerification"
  | "accountSaveNewCode"
  | "accountSecurity"
  | "accountSendInstructions"
  | "accountSessionHelp"
  | "accountShowCode"
  | "accountSignedIn"
  | "accountTournamentOpenError"
  | "accountTournamentCompleted"
  | "accountTournamentController"
  | "accountTournamentReadOnly"
  | "accountTournamentStatusActive"
  | "accountTournamentStatusFinished"
  | "accountTournamentStatusSetup"
  | "accountTournamentUpdated"
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
  | "court"
  | "courts"
  | "dark"
  | "darkGold"
  | "draws"
  | "edit"
  | "editScore"
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
  | "screenMirroring"
  | "screenMirroringAppleBody"
  | "screenMirroringAppleTitle"
  | "screenMirroringChromeDesktopBody"
  | "screenMirroringChromeDesktopTitle"
  | "screenMirroringDirectUnavailableBody"
  | "screenMirroringDirectUnavailableTitle"
  | "screenMirroringGenericBody"
  | "screenMirroringGenericTitle"
  | "screenMirroringMobileBody"
  | "screenMirroringMobileTitle"
  | "screenMirroringOtherDevices"
  | "screenMirroringSubtitle"
  | "screenMirroringWindowsBody"
  | "screenMirroringWindowsTitle"
  | "losses"
  | "matches"
  | "matchesInActiveRound"
  | "matchPoints"
  | "matchResults"
  | "matchHistoryUnavailable"
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
  | "formatAmericanoDescription"
  | "formatMexicano"
  | "formatMexicanoDescription"
  | "formatMixedAmericano"
  | "formatMixedAmericanoDescription"
  | "fixedPartnerAmericanoDescription"
  | "fixedPartnerMexicanoDescription"
  | "formatPoolPlay"
  | "finalPlacements"
  | "homeNewTournamentDescription"
  | "homeSettingsDescription"
  | "homeTournamentsDescription"
  | "hybridLezgo"
  | "loadingSettings"
  | "loadingTournament"
  | "loadingTournaments"
  | "logout"
  | "resumeTimer"
  | "savedInRound"
  | "savedShort"
  | "registerScorePoints"
  | "linkCopied"
  | "noActiveTournaments"
  | "noCompletedTournaments"
  | "openLive"
  | "openTeamMatch"
  | "ocean"
  | "ownerScoreConflictMessage"
  | "ownerTournamentConflictMessage"
  | "review"
  | "retry"
  | "remoteNotSaved"
  | "remoteControlledByOtherUser"
  | "remoteControlledByOtherUserHelp"
  | "remoteScoreSaving"
  | "remoteTopStandings"
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
  | "team"
  | "teams"
  | "timeLimitMinutes"
  | "timeFreeScoring"
  | "totalScorePoints"
  | "totalScorePointsCount"
  | "tournaments"
  | "tournamentsDescription"
  | "tournamentsLoginRequired"
  | "tournamentFormat"
  | "tournamentSettings"
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
  | "wins";

export const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
  da: {
    activeTournament: "Aktiv turnering",
    active: "Aktive",
    account: "Konto",
    accountAlreadyHaveLogin: "Har du allerede en bruger? Log ind",
    accountBackToLogin: "Tilbage til log ind",
    accountCode: "6-tegns kode",
    accountCodeInvalid: "Koden skal være præcis 6 bogstaver og/eller tal.",
    accountCodeCouldNotReset: "Koden kunne ikke gemmes.",
    accountCodeMismatch: "Koderne er ikke ens.",
    accountCodeReset: "Din kode er ændret.",
    accountChangeCode: "Skift kode",
    accountContinue: "Fortsæt",
    accountCreateAccount: "Opret bruger",
    accountCreateOrLogin: "Opret bruger / Log ind",
    accountCreateSubmit: "Opret bruger",
    accountCreateTournament: "Opret ny turnering",
    accountCreated: "Brugeren er oprettet. Log ind med email eller brugernavn og din kode.",
    accountCreateError: "Brugeren kunne ikke oprettes.",
    accountCurrentCode: "Nuværende kode",
    accountCurrentSession: "Denne enhed er logget ind.",
    accountEmail: "E-mail",
    accountEmailNotVerified: "Din e-mail er ikke bekræftet endnu. Tjek din indbakke.",
    accountEmailVerificationFailed: "E-mailen kunne ikke bekræftes. Prøv linket igen, eller send en ny mail.",
    accountEmailVerifiedMessage: "E-mail bekræftet. Din konto er nu aktiveret. Du kan logge ind.",
    accountForgotCode: "Glemt kode",
    accountForgotCodeHelp: "Indtast den email, der er tilknyttet din konto.",
    accountGenericRecovery: "Hvis e-mailadressen er registreret, har vi sendt instruktioner til at oprette en ny kode.",
    accountHideCode: "Skjul kode",
    accountIdentifier: "Email eller brugernavn",
    accountLogin: "Log ind",
    accountLoginAdminNotRemembered: "Administrator-login huskes ikke af sikkerhedsmæssige årsager.",
    accountLoginError: "Email/brugernavn eller kode er forkert.",
    accountLogoutOtherDevices: "Log andre enheder ud",
    accountLogoutOtherDevicesConfirm: "Log andre enheder ud?",
    accountLogoutOtherDevicesError: "Andre enheder kunne ikke logges ud.",
    accountLogoutOtherDevicesHelp: "Andre enheder, hvor din konto er logget ind, skal logge ind igen.",
    accountLogoutOtherDevicesSuccess: "Andre enheder er logget ud.",
    accountNewCode: "Ny 6-tegns kode",
    accountLoggedIn: "Du er logget ind.",
    accountLoggedOut: "Du er logget ud.",
    accountName: "Navn",
    accountOtpCouldNotSend: "Login-koden kunne ikke sendes.",
    accountOtpCouldNotVerify: "Login-koden kunne ikke bekræftes.",
    accountOtpHelp: "Indtast navn og e-mail. Vi sender en Supabase-verifikationskode til e-mailen.",
    accountOtpSent: "Tjek din e-mail og indtast verifikationskoden.",
    accountNoOwnTournaments: "Du har endnu ingen turneringer.",
    accountOpenTournament: "Åbn turnering",
    accountOwnTournaments: "Mine turneringer",
    accountRepeatCode: "Gentag kode",
    accountRecoveryCodeChanged: "Din kode er ændret. Du kan nu logge ind.",
    accountRecoveryInvalidLink: "Linket er ugyldigt eller udløbet.",
    accountRememberLogin: "Husk kode på denne enhed",
    accountResetCodeTitle: "Nulstil kode",
    accountResendVerification: "Send mail igen",
    accountSaveNewCode: "Gem ny kode",
    accountSecurity: "Sikkerhed",
    accountSendInstructions: "Send instruktioner",
    accountSessionHelp: "Du kan skifte kode eller logge andre enheder ud uden at ændre dine turneringer.",
    accountShowCode: "Vis kode",
    accountSignedIn: "Logget ind",
    accountTournamentOpenError: "Turneringen kunne ikke åbnes.",
    accountTournamentCompleted: "Afsluttet",
    accountTournamentController: "Du styrer",
    accountTournamentReadOnly: "Kun visning",
    accountTournamentStatusActive: "Aktiv",
    accountTournamentStatusFinished: "Afsluttet",
    accountTournamentStatusSetup: "Kladde",
    accountTournamentUpdated: "Sidst opdateret:",
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
    court: "Bane",
    courts: "Baner",
    dark: "Mørk",
    darkGold: "Dark Gold",
    draws: "Uafgjort",
    edit: "Rediger",
    editScore: "Rediger score",
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
    screenMirroring: "Screen Mirroring",
    screenMirroringAppleBody: "Brug Skærmspejling/AirPlay og vælg dit TV.",
    screenMirroringAppleTitle: "Apple",
    screenMirroringChromeDesktopBody: "Brug Cast i Chrome og vælg dit TV.",
    screenMirroringChromeDesktopTitle: "Chrome / desktop",
    screenMirroringDirectUnavailableBody: "Brug browserens eller enhedens indbyggede skærmvalg for at vise den samme controller-skærm på TV-skærmen.",
    screenMirroringDirectUnavailableTitle: "Direkte TV-søgning er ikke tilgængelig i webversionen.",
    screenMirroringGenericBody: "Brug browserens eller enhedens indbyggede Cast/Skærmspejling og vælg dit TV.",
    screenMirroringGenericTitle: "Denne enhed",
    screenMirroringMobileBody: "Brug telefonens eller tablettens indbyggede Cast/Skærmspejling.",
    screenMirroringMobileTitle: "Mobil / tablet",
    screenMirroringOtherDevices: "Andre enheder",
    screenMirroringSubtitle: "Vis LEZGO-turneringen på dit TV.",
    screenMirroringWindowsBody: "Tryk Win + K og vælg dit TV.",
    screenMirroringWindowsTitle: "Windows",
    losses: "Tab",
    matches: "Kampe",
    matchesInActiveRound: "Kampe i aktiv runde",
    matchPoints: "Matchpoint",
    matchResults: "Kampresultater",
    matchHistoryUnavailable: "Detaljerede kampresultater er ikke tilgængelige for denne turnering.",
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
    fixedPartnerAmericanoDescription: "Faste makkerpar møder de øvrige par.",
    fixedPartnerMexicano: "Fast Makker Mexicano",
    fixedPartnerMexicanoDescription: "Faste makkerpar møder modstandere efter stillingen.",
    fixedScore: "Fast score",
    format: "Format",
    formatAmericano: "Americano",
    formatAmericanoDescription: "Alle spiller med og mod hinanden.",
    formatMexicano: "Mexicano",
    formatMexicanoDescription: "Nye makkere og modstandere dannes efter stillingen.",
    formatMixedAmericano: "Mixed Americano",
    formatMixedAmericanoDescription: "Kvinde og mand spiller sammen i skiftende makkerpar.",
    formatPoolPlay: "Puljespil",
    finalPlacements: "Slutplaceringer",
    homeNewTournamentDescription: "Vælg format, indstillinger og spillere.",
    homeSettingsDescription: "Kun de nødvendige valg.",
    homeTournamentsDescription: "Aktive, kommende, afsluttede og tidligere.",
    loadingSettings: "Indlæser indstillinger...",
    loadingTournament: "Indlæser turnering...",
    loadingTournaments: "Indlæser turneringer...",
    logout: "Log ud",
    resumeTimer: "Fortsæt ur",
    savedInRound: "Gemt i runden",
    savedShort: "Gemt",
    registerScorePoints: "Registrer scorepoint",
    linkCopied: "Link kopieret.",
    noActiveTournaments: "Ingen aktive turneringer.",
    noCompletedTournaments: "Ingen afsluttede turneringer endnu.",
    openLive: "Åbn live",
    openTeamMatch: "Åbn holdkamp",
    ocean: "Ocean",
    ownerScoreConflictMessage: "Scoren er blevet ændret på en anden enhed. Den nyeste score er indlæst.",
    ownerTournamentConflictMessage: "Turneringen blev ændret på en anden enhed. De nyeste data er hentet. Prøv igen.",
    review: "Gennemse",
    retry: "Prøv igen",
    remoteNotSaved: "Ikke gemt",
    remoteControlledByOtherUser: "Du har ikke længere styring af denne turnering.",
    remoteControlledByOtherUserHelp: "Du kan stadig se turneringen, men du kan ikke længere ændre den.",
    remoteScoreSaving: "Gemmer...",
    remoteTopStandings: "Stilling",
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
    team: "Hold",
    teams: "Hold",
    timeLimitMinutes: "Spilletid (minutter)",
    timeFreeScoring: "Tid (fri scoring)",
    totalScorePoints: "Samlet til antal scorepoint",
    totalScorePointsCount: "Samlet antal scorepoint",
    tournaments: "Turneringer",
    tournamentsDescription: "Aktive og afsluttede turneringer gemmes lokalt.",
    tournamentsLoginRequired: "Log ind for at se dine turneringer.",
    tournamentFormat: "Turneringsform",
    tournamentSettings: "Turneringsindstillinger",
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
    wins: "Sejre",
  },
  en: {
    activeTournament: "Active tournament",
    active: "Active",
    account: "Account",
    accountAlreadyHaveLogin: "Already have an account? Log in",
    accountBackToLogin: "Back to log in",
    accountCode: "6-character code",
    accountCodeInvalid: "The code must be exactly 6 letters and/or numbers.",
    accountCodeCouldNotReset: "The code could not be saved.",
    accountCodeMismatch: "The codes do not match.",
    accountCodeReset: "Your code has been changed.",
    accountChangeCode: "Change code",
    accountContinue: "Continue",
    accountCreateAccount: "Create account",
    accountCreateOrLogin: "Create account / Log in",
    accountCreateSubmit: "Create account",
    accountCreateTournament: "Create new tournament",
    accountCreated: "The account has been created. Log in with email or username and your code.",
    accountCreateError: "The account could not be created.",
    accountCurrentCode: "Current code",
    accountCurrentSession: "This device is signed in.",
    accountEmail: "Email",
    accountEmailNotVerified: "Your email is not verified yet. Check your inbox.",
    accountEmailVerificationFailed: "The email could not be verified. Try the link again or send a new email.",
    accountEmailVerifiedMessage: "Email verified. Your account is now active. You can log in.",
    accountForgotCode: "Forgot code",
    accountForgotCodeHelp: "Enter the email linked to your account.",
    accountGenericRecovery: "If the email address is registered, we have sent instructions for creating a new code.",
    accountHideCode: "Hide code",
    accountIdentifier: "Email or username",
    accountLogin: "Log in",
    accountLoginAdminNotRemembered: "Administrator login is not remembered for security reasons.",
    accountLoginError: "Email/username or code is incorrect.",
    accountLogoutOtherDevices: "Log out other devices",
    accountLogoutOtherDevicesConfirm: "Log out other devices?",
    accountLogoutOtherDevicesError: "Other devices could not be logged out.",
    accountLogoutOtherDevicesHelp: "Other devices where your account is signed in must sign in again.",
    accountLogoutOtherDevicesSuccess: "Other devices have been logged out.",
    accountNewCode: "New 6-character code",
    accountLoggedIn: "You are logged in.",
    accountLoggedOut: "You are logged out.",
    accountName: "Name",
    accountOtpCouldNotSend: "The login code could not be sent.",
    accountOtpCouldNotVerify: "The login code could not be verified.",
    accountOtpHelp: "Enter name and email. We send a Supabase verification code to the email address.",
    accountOtpSent: "Check your email and enter the verification code.",
    accountNoOwnTournaments: "You do not have any tournaments yet.",
    accountOpenTournament: "Open tournament",
    accountOwnTournaments: "My tournaments",
    accountRepeatCode: "Repeat code",
    accountRecoveryCodeChanged: "Your code has been changed. You can now log in.",
    accountRecoveryInvalidLink: "The link is invalid or expired.",
    accountRememberLogin: "Remember on this device",
    accountResetCodeTitle: "Reset code",
    accountResendVerification: "Send email again",
    accountSaveNewCode: "Save new code",
    accountSecurity: "Security",
    accountSendInstructions: "Send instructions",
    accountSessionHelp: "You can change your code or log out other devices without changing your tournaments.",
    accountShowCode: "Show code",
    accountSignedIn: "Signed in",
    accountTournamentOpenError: "The tournament could not be opened.",
    accountTournamentCompleted: "Completed",
    accountTournamentController: "You control",
    accountTournamentReadOnly: "View only",
    accountTournamentStatusActive: "Active",
    accountTournamentStatusFinished: "Completed",
    accountTournamentStatusSetup: "Draft",
    accountTournamentUpdated: "Last updated:",
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
    court: "Court",
    courts: "Courts",
    dark: "Dark",
    darkGold: "Dark Gold",
    draws: "Draws",
    edit: "Edit",
    editScore: "Edit score",
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
    screenMirroring: "Screen Mirroring",
    screenMirroringAppleBody: "Use Screen Mirroring/AirPlay and select your TV.",
    screenMirroringAppleTitle: "Apple",
    screenMirroringChromeDesktopBody: "Use Cast in Chrome and select your TV.",
    screenMirroringChromeDesktopTitle: "Chrome / desktop",
    screenMirroringDirectUnavailableBody: "Use your browser's or device's built-in screen sharing options to show the same controller screen on your TV.",
    screenMirroringDirectUnavailableTitle: "Direct TV discovery is not available in the web version.",
    screenMirroringGenericBody: "Use your browser's or device's built-in Cast/Screen Mirroring and select your TV.",
    screenMirroringGenericTitle: "This device",
    screenMirroringMobileBody: "Use your phone's or tablet's built-in Cast/Screen Mirroring.",
    screenMirroringMobileTitle: "Mobile / tablet",
    screenMirroringOtherDevices: "Other devices",
    screenMirroringSubtitle: "Show the LEZGO tournament on your TV.",
    screenMirroringWindowsBody: "Press Win + K and select your TV.",
    screenMirroringWindowsTitle: "Windows",
    losses: "Losses",
    matches: "Matches",
    matchesInActiveRound: "Matches in active round",
    matchPoints: "Match points",
    matchResults: "Match results",
    matchHistoryUnavailable: "Detailed match results are not available for this tournament.",
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
    fixedPartnerAmericanoDescription: "Fixed partner pairs play the other pairs.",
    fixedPartnerMexicano: "Fixed Partner Mexicano",
    fixedPartnerMexicanoDescription: "Fixed partner pairs meet opponents by standings.",
    fixedScore: "Fixed score",
    format: "Format",
    formatAmericano: "Americano",
    formatAmericanoDescription: "Everyone plays with and against each other.",
    formatMexicano: "Mexicano",
    formatMexicanoDescription: "New partners and opponents are formed by standings.",
    formatMixedAmericano: "Mixed Americano",
    formatMixedAmericanoDescription: "Women and men pair up in changing teams.",
    formatPoolPlay: "Pool Play",
    finalPlacements: "Final placements",
    homeNewTournamentDescription: "Choose format, settings and players.",
    homeSettingsDescription: "Only the essential options.",
    homeTournamentsDescription: "Active, upcoming, completed and previous tournaments.",
    loadingSettings: "Loading settings...",
    loadingTournament: "Loading tournament...",
    loadingTournaments: "Loading tournaments...",
    logout: "Log out",
    resumeTimer: "Resume timer",
    savedInRound: "Saved this round",
    savedShort: "Saved",
    registerScorePoints: "Enter score points",
    linkCopied: "Link copied.",
    noActiveTournaments: "No active tournaments.",
    noCompletedTournaments: "No completed tournaments yet.",
    openLive: "Open live",
    openTeamMatch: "Open team match",
    ocean: "Ocean",
    ownerScoreConflictMessage: "The score was changed on another device. The latest score has been loaded.",
    ownerTournamentConflictMessage: "The tournament was changed on another device. The latest data has been loaded. Please try again.",
    review: "Review",
    retry: "Try again",
    remoteNotSaved: "Not saved",
    remoteControlledByOtherUser: "This tournament is now controlled by another user.",
    remoteControlledByOtherUserHelp: "You can still view the tournament, but you can no longer change it.",
    remoteScoreSaving: "Saving...",
    remoteTopStandings: "Standings",
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
    team: "Team",
    teams: "Teams",
    timeLimitMinutes: "Playing time (minutes)",
    timeFreeScoring: "Time (free scoring)",
    totalScorePoints: "Total score points",
    totalScorePointsCount: "Total score points",
    tournaments: "Tournaments",
    tournamentsDescription: "Active and completed tournaments are saved locally.",
    tournamentsLoginRequired: "Log in to view your tournaments.",
    tournamentFormat: "Tournament format",
    tournamentSettings: "Tournament settings",
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
    wins: "Wins",
  },
};

export function translate(language: AppLanguage, key: TranslationKey): string {
  return translations[language][key];
}

export function normalizeLanguage(language: unknown): AppLanguage {
  return language === "en" ? "en" : "da";
}
