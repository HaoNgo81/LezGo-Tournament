param(
  [string]$BaseUrl = "http://127.0.0.1:3026",
  [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [int]$Port = 9227
)

$ErrorActionPreference = "Stop"
$ArtifactDir = Join-Path $env:TEMP "lezgo-account-modal-browser"
New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null

$script:NextCdpId = 1

function New-CdpJson {
  param([hashtable]$Value)
  $Value | ConvertTo-Json -Depth 100 -Compress
}

function Send-Cdp {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Method,
    [hashtable]$Params = @{}
  )

  $id = $script:NextCdpId
  $script:NextCdpId += 1
  $payload = New-CdpJson @{ id = $id; method = $Method; params = $Params }
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $ct = [Threading.CancellationToken]::None
  $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).GetAwaiter().GetResult()

  $buffer = [byte[]]::new(1048576)
  while ($true) {
    $chunks = [System.Collections.Generic.List[byte]]::new()
    do {
      $result = $Socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $ct).GetAwaiter().GetResult()
      if ($result.Count -gt 0) {
        $chunks.AddRange([byte[]]($buffer[0..($result.Count - 1)]))
      }
    } while (-not $result.EndOfMessage)
    $text = [Text.Encoding]::UTF8.GetString($chunks.ToArray())
    if ([string]::IsNullOrWhiteSpace($text)) {
      continue
    }
    $message = $text | ConvertFrom-Json
    if ($message.id -ne $id) {
      continue
    }
    if ($message.error) {
      throw "CDP $Method failed: $($message.error.message)"
    }
    return $message.result
  }
}

function Invoke-CdpEval {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Expression
  )
  $result = Send-Cdp $Socket "Runtime.evaluate" @{
    expression = $Expression
    awaitPromise = $true
    returnByValue = $true
  }
  if ($result.exceptionDetails) {
    throw "Browser evaluation failed: $($result.exceptionDetails.text)"
  }
  return $result.result.value
}

function Wait-CdpFor {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Expression,
    [string]$Label
  )
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (Invoke-CdpEval $Socket $Expression) {
      return
    }
    Start-Sleep -Milliseconds 100
  }
  throw "Timed out waiting for $Label"
}

function Invoke-CdpClickUntil {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$ClickExpression,
    [string]$ReadyExpression,
    [string]$Label
  )
  $deadline = (Get-Date).AddSeconds(10)
  Start-Sleep -Milliseconds 500
  while ((Get-Date) -lt $deadline) {
    Invoke-CdpEval $Socket $ClickExpression | Out-Null
    Start-Sleep -Milliseconds 250
    if (Invoke-CdpEval $Socket $ReadyExpression) {
      return
    }
  }
  throw "Timed out opening $Label"
}

function Get-MetricsExpression {
  @'
(() => {
  function rectOf(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      className: el.getAttribute("class"),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      display: cs.display,
      position: cs.position,
      overflowY: cs.overflowY,
      maxHeight: cs.maxHeight,
      heightStyle: cs.height,
      backdropFilter: cs.backdropFilter
    };
  }
  function visible(label) {
    const nodes = Array.from(document.querySelectorAll("label,button,h2,p"));
    const el = nodes.find((node) => {
      const text = (node.textContent || "").trim();
      return text === label || text.startsWith(label);
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { label, top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), visible: r.bottom > 0 && r.top < innerHeight };
  }
  const topBar = document.querySelector("[data-testid='main-account-top-bar']");
  const dialog = document.querySelector("[data-testid='main-account-dialog']");
  return {
    viewport: { width: innerWidth, height: innerHeight },
    bodyOverflow: getComputedStyle(document.body).overflow,
    topBarContainsDialog: Boolean(topBar && dialog && topBar.contains(dialog)),
    bodyContainsDialog: Boolean(dialog && document.body.contains(dialog)),
    overlay: rectOf("[data-testid='main-account-dialog']"),
    panel: rectOf("[data-testid='main-account-dialog-panel']"),
    scroll: rectOf("[data-testid='main-account-dialog-scroll']"),
    accountPanel: rectOf("[data-testid='account-panel']"),
    labels: ["Konto", "Opret bruger", "Navn", "Brugernavn", "E-mail", "6-tegns kode", "Gentag kode", "Vis kode", "Har du allerede en bruger? Log ind"].map(visible),
    pageOverflowX: document.documentElement.scrollWidth > innerWidth
  };
})()
'@
}

function Measure-CreateModal {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Name,
    [int]$Width,
    [int]$Height,
    [bool]$Mobile = $false
  )

  Send-Cdp $Socket "Emulation.setDeviceMetricsOverride" @{
    width = $Width
    height = $Height
    deviceScaleFactor = 1
    mobile = $Mobile
  } | Out-Null
  Send-Cdp $Socket "Page.navigate" @{ url = "$BaseUrl/" } | Out-Null
  Wait-CdpFor $Socket 'Boolean(document.querySelector("[data-testid=''main-account-create-control'']"))' "create button"
  Invoke-CdpClickUntil $Socket `
    'document.querySelector("[data-testid=''main-account-create-control'']").click(); true' `
    'Boolean(document.querySelector("[data-testid=''main-account-dialog-panel'']"))' `
    "account modal"
  Start-Sleep -Milliseconds 150

  $before = Invoke-CdpEval $Socket (Get-MetricsExpression)
  Invoke-CdpEval $Socket @'
(() => {
  const scroll = document.querySelector("[data-testid='main-account-dialog-scroll']");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
  return true;
})()
'@ | Out-Null
  Start-Sleep -Milliseconds 100
  $afterScroll = Invoke-CdpEval $Socket @'
(() => {
  const buttons = Array.from(document.querySelectorAll("button"));
  const submit = buttons.find((button) => (button.textContent || "").trim() === "Opret bruger");
  const switchButton = buttons.find((button) => (button.textContent || "").trim() === "Har du allerede en bruger? Log ind");
  const scroll = document.querySelector("[data-testid='main-account-dialog-scroll']");
  function pos(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), visible: r.bottom > 0 && r.top < innerHeight };
  }
  return { submit: pos(submit), switchButton: pos(switchButton), scroll: scroll ? { scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight } : null };
})()
'@

  $screenshot = Send-Cdp $Socket "Page.captureScreenshot" @{ format = "png"; fromSurface = $true }
  $screenshotPath = Join-Path $ArtifactDir "account-modal-$Name.png"
  [IO.File]::WriteAllBytes($screenshotPath, [Convert]::FromBase64String($screenshot.data))

  $firstField = $before.labels | Where-Object { $_.label -eq "Navn" } | Select-Object -First 1
  $pass = [ordered]@{
    normalWidth = $before.panel.width -gt 350
    normalHeight = $before.panel.height -gt 300
    topVisible = $before.panel.top -ge 0
    overlayViewportSized = $before.overlay.width -eq $Width -and $before.overlay.height -eq $Height
    firstFieldVisible = [bool]$firstField.visible
    bottomReachable = [bool]$afterScroll.switchButton.visible
    noHorizontalOverflow = -not [bool]$before.pageOverflowX
    notCollapsed = $before.panel.height -gt 300
    notInsideTopBar = -not [bool]$before.topBarContainsDialog
    bodyScrollLocked = $before.bodyOverflow -eq "hidden"
  }

  [ordered]@{
    name = $Name
    requestedViewport = @{ width = $Width; height = $Height; mobile = $Mobile }
    before = $before
    afterScroll = $afterScroll
    screenshotPath = $screenshotPath
    pass = $pass
    allPass = -not ($pass.Values -contains $false)
  }
}

function Measure-ShortDialog {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$View
  )
  Send-Cdp $Socket "Emulation.setDeviceMetricsOverride" @{
    width = 1536
    height = 960
    deviceScaleFactor = 1
    mobile = $false
  } | Out-Null
  Send-Cdp $Socket "Page.navigate" @{ url = "$BaseUrl/" } | Out-Null
  Wait-CdpFor $Socket 'Boolean(document.querySelector("[data-testid=''main-account-control'']"))' "login button"
  Invoke-CdpClickUntil $Socket `
    'document.querySelector("[data-testid=''main-account-control'']").click(); true' `
    'Boolean(document.querySelector("[data-testid=''main-account-dialog-panel'']"))' `
    "$View modal"
  if ($View -eq "forgot") {
    Wait-CdpFor $Socket 'Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").trim() === "Glemt kode?")' "forgot button"
    Invoke-CdpEval $Socket 'Array.from(document.querySelectorAll("button")).find((button) => (button.textContent || "").trim() === "Glemt kode?").click(); true' | Out-Null
  }
  Wait-CdpFor $Socket 'Boolean(document.querySelector("[data-testid=''main-account-dialog-panel'']"))' "$View modal"
  $panel = Invoke-CdpEval $Socket @'
(() => {
  const el = document.querySelector("[data-testid='main-account-dialog-panel']");
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), text: document.body.innerText };
})()
'@
  [ordered]@{
    view = $View
    panel = $panel
    pass = $panel.width -gt 350 -and $panel.height -gt 200 -and $panel.height -lt 650
  }
}

$chrome = $null
$socket = $null
$userDataDir = Join-Path $env:TEMP ("lezgo-chrome-" + [guid]::NewGuid())

try {
  $chrome = Start-Process -FilePath $ChromePath -ArgumentList @(
    "--headless=new",
    "--remote-debugging-port=$Port",
    "--remote-allow-origins=*",
    "--user-data-dir=$userDataDir",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-gpu-sandbox",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "about:blank"
  ) -PassThru -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(10)
  do {
    try {
      Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" | Out-Null
      break
    } catch {
      Start-Sleep -Milliseconds 100
    }
  } while ((Get-Date) -lt $deadline)

  $page = Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$Port/json/new"
  $socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  Send-Cdp $socket "Page.enable" | Out-Null
  Send-Cdp $socket "Runtime.enable" | Out-Null

  $createResults = @(
    Measure-CreateModal $socket "desktop-1536x960" 1536 960 $false
    Measure-CreateModal $socket "desktop-1366x768" 1366 768 $false
    Measure-CreateModal $socket "mobile-390x844" 390 844 $true
  )
  $login = Measure-ShortDialog $socket "login"
  $forgot = Measure-ShortDialog $socket "forgot"
  $allPass = -not (($createResults | Where-Object { -not $_.allPass }) -or -not $login.pass -or -not $forgot.pass)
  $result = [ordered]@{
    baseUrl = $BaseUrl
    artifactDir = $ArtifactDir
    createResults = $createResults
    login = $login
    forgot = $forgot
    allPass = $allPass
  }
  $result | ConvertTo-Json -Depth 100
  if (-not $allPass) {
    exit 1
  }
} finally {
  if ($socket) {
    $socket.Dispose()
  }
  if ($chrome) {
    Stop-Process -Id $chrome.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 500
  Remove-Item -LiteralPath $userDataDir -Recurse -Force -ErrorAction SilentlyContinue
}
