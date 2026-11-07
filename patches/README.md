# MyGo Music host support

The [v0.1.19 patch](mygo-v0.1.19.patch) ports the companion plugin features to MyGo Music commit `afba39045fc3993f1f65b83cc01a23f259921dd6`: positioned sidebar groups and separators, a dynamic liked-songs cover, podcast tabs, cloud uploads, CUE splitting and FFmpeg-backed playback for additional formats. It preserves the v0.1.19 audio decoders and browse header.

On Windows, run [`scripts/build-patched-player.ps1`](../scripts/build-patched-player.ps1) from the plugin repository in PowerShell. It requires Git, Go 1.27.3 and Bun, applies the pinned patch, runs the focused tests, and creates `dist/mygo-music-v0.1.19-windows-amd64-netease.zip`. Upload that zip to your release. It contains `MyGo Music.exe` and the required `icon.png` resource; extract both together before running. The app keeps MyGo's usual app identifier and data directory, and an official update may replace it later.

The build was cross-compiled and the focused regression tests passed in this workspace. The complete player test suite still needs a run on a host that permits local test listeners.

The proposed upstream API issue is drafted in [`mygo-plugin-api-issue-draft.md`](mygo-plugin-api-issue-draft.md). Open [a new MyGo Music issue](https://github.com/egoist/mygo-music/issues/new) and paste the draft there.
