param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sourceDirectory = Join-Path $env:TEMP "mygo-music-v0.1.19-netease"
$patchDirectory = Join-Path $repoRoot "patches"
$version = "v0.1.19"

function Require-Command([string]$Name, [string]$InstallHint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $InstallHint"
    }
}

Require-Command "git" "Install Git for Windows and retry."
Require-Command "go" "Install Go 1.27.3 and retry."
Require-Command "bun" "Install Bun and retry."

$goVersion = (& go version)
if ($LASTEXITCODE -ne 0 -or $goVersion -notmatch "go1\.27\.3\b") {
    throw "Go 1.27.3 is required; found: $goVersion"
}

if (-not (Test-Path (Join-Path $sourceDirectory ".git"))) {
    & git clone --depth 1 --branch $version https://github.com/egoist/mygo-music.git $sourceDirectory
    if ($LASTEXITCODE -ne 0) { throw "Could not clone MyGo Music $version." }
}

$worktree = (& git -C $sourceDirectory status --porcelain)
if ($LASTEXITCODE -ne 0 -or $worktree) {
    throw "The work directory is not clean: '$sourceDirectory'. Remove it and retry."
}

$head = (& git -C $sourceDirectory rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "afba39045fc3993f1f65b83cc01a23f259921dd6") {
    throw "The work directory is not the verified MyGo Music $version source. Remove '$sourceDirectory' and retry."
}

$patches = @(
    "mygo-v0.1.19.patch"
)

foreach ($name in $patches) {
    $path = Join-Path $patchDirectory $name
    & git -C $sourceDirectory apply --check $path
    if ($LASTEXITCODE -ne 0) { throw "Patch check failed: $name" }
    & git -C $sourceDirectory apply $path
    if ($LASTEXITCODE -ne 0) { throw "Could not apply patch: $name" }
}

Push-Location $sourceDirectory
try {
    & go test ./internal/music ./internal/player ./internal/plugin ./internal/i18n
    if ($LASTEXITCODE -ne 0) { throw "MyGo package tests failed." }
    & go test ./internal/app -run 'Test(PositionedSidebarGroups|SidebarPlaylistCollapse|NewPlaylistInCollapsedSidebar|NavigationIsTheSidebar|LikedCoverFollowsFirstSong|LikedPagePaging|LikeGoesBack|LikeFromPlayerBar|BrowseTabNavigation|UploadPickerAndBatch|CancelUploadBatch)$'
    if ($LASTEXITCODE -ne 0) { throw "MyGo UI regression tests failed." }
    & go test ./internal/app -run '^TestArtist(ScrollPaging|PagingRetry|PersonalPageButton)$' -count=5
    if ($LASTEXITCODE -ne 0) { throw "Artist pagination regression tests failed." }
    & go tool mygo build -platform windows/amd64 -skip-installer
    if ($LASTEXITCODE -ne 0) { throw "MyGo Windows build failed." }
}
finally {
    Pop-Location
}

$builtPlayer = Get-ChildItem (Join-Path $sourceDirectory "build") -Filter "MyGo Music.exe" -File -Recurse |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $builtPlayer) { throw "The build succeeded but MyGo Music.exe was not found under the source build directory." }

$null = New-Item -ItemType Directory -Path $OutputDirectory -Force
$outputDirectory = (Resolve-Path $OutputDirectory).Path
$icon = Join-Path $builtPlayer.DirectoryName "icon.png"
if (-not (Test-Path $icon)) { throw "The build resource icon.png is missing beside the executable." }
$stageDirectory = Join-Path $sourceDirectory "release"
$null = New-Item -ItemType Directory -Path $stageDirectory -Force
Copy-Item -LiteralPath $builtPlayer.FullName -Destination $stageDirectory -Force
Copy-Item -LiteralPath $icon -Destination $stageDirectory -Force
$archive = Join-Path $outputDirectory "mygo-music-v0.1.19-windows-amd64-netease.zip"
Compress-Archive -Path (Join-Path $stageDirectory "*") -DestinationPath $archive -Force
Write-Output "Built release archive: $archive"
Write-Output "The archive contains the executable and its required icon.png. It keeps MyGo's existing app identifier and user data; the official auto-updater can replace it later."
