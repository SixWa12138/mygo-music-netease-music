# MyGo Music host support

`mygo-sidebar.patch` applies to [MyGo Music v0.1.13](https://github.com/egoist/mygo-music/tree/v0.1.13) (`799ec1bac6d3006ac1aa29e06be9e6ae92cf0028`). It adds three optional navigation builtins: `separator`, `myPlaylists`, and `savedPlaylists`, plus the `cloud` icon. Existing manifests keep their automatic playlist groups. A manifest that positions those groups gets them once, in the requested order.

Apply in a checkout of that tag:

```sh
git apply /path/to/netease-music/patches/mygo-sidebar.patch
go test ./internal/app -run 'Test(PositionedSidebarGroups|SidebarPlaylistCollapse|NewPlaylistInCollapsedSidebar|NavigationIsTheSidebar)$' -count=5
go tool mygo build -platform windows/amd64 -skip-installer
```

`mygo-liked-cover.patch` also applies to v0.1.13, with or without the sidebar patch. The Liked Songs header uses the first song's album artwork and follows successful likes and unlikes. Empty lists and missing, loading or failed artwork show the original heart placeholder. It uses the existing image cache and the current list order, with no extra polling.

```sh
git apply /path/to/netease-music/patches/mygo-liked-cover.patch
go test ./internal/app -run 'Test(LikedCoverFollowsFirstSong|LikedPagePaging|LikeGoesBack|LikeFromPlayerBar)$' -count=5
go tool mygo build -platform windows/amd64 -skip-installer
```

The upstream build uses Go 1.27.3 and Bun for its TypeScript configuration. This session built the same configuration as JSON with version `0.1.13+sidebar.2`, including both patches. It keeps the original app identifier, data folder, icon and update source.

Validation: the focused sidebar tests and liked cover tests each passed five runs. The cover test exercises initial loading, adding a like, removing the first song, rejected mutations, missing artwork and an empty list; setting `MM_FRAMES` to an existing directory saves previews. The complete `go test ./internal/...` run passed all packages except the two existing Linux notch greeting tests (`TestNotchGreetsOnce`, `TestNotchGreetingKeptUnderPointer`); both also failed with the original, unmodified source. The optional `TestPluginSidebarFrame` saves a visual preview when `MM_FRAMES` and `MM_NAV_MANIFEST` are set.

A later official app update can replace these local changes. Reapply the patches to a compatible source version and rebuild if needed.

## Cloud uploads and podcast tabs

`mygo-cloud-library.patch` applies after both patches above. It adds optional browse tabs and a cloud upload control, with streaming uploads limited to files selected in the native picker. It preserves the positioned sidebar and dynamic liked cover. The combined Windows build is `0.1.13+cloud.1`, used with plugin 0.4.0.

```sh
git apply /path/to/netease-music/patches/mygo-cloud-library.patch
go test ./internal/music ./internal/player ./internal/plugin ./internal/i18n
go test ./internal/app -run 'Test(BrowseTabNavigation|UploadPickerAndBatch|CancelUploadBatch)$' -count=5
go tool mygo build -platform windows/amd64 -skip-installer
```

The picker accepts MP3, AAC, WMA, WAV, OGG, M4A, APE, FLAC and CUE, including `.flac.cue`. CUE sheets are read as UTF-8, UTF-16 or GB18030, split at INDEX 01 boundaries and uploaded one track at a time as temporary FLAC files with their metadata. Referenced audio must stay within the sheet's folder. The original files are never modified.

CUE splitting and playback of additional audio formats use FFmpeg from PATH (`ffmpeg.exe` on Windows). These playback formats wait for the whole download before decoding. Temporary files are removed after their upload or playback ends. Uploads support progress, cancellation, per-file errors and a refreshed cloud list.

Validation covers selected-file lifetime, network permissions, upload redirects, cancellation, partial batch results, CUE parsing and boundaries, metadata, format recognition, compatible decoding and tab navigation. The complete Go suite retains the two upstream Linux notch failures described above. Live verification uploaded the authorized `GOOD BOY.m4a` once and played its cloud copy in the installed Windows app. Real FFmpeg checks verified seeking, exact CUE cuts, metadata and cleanup; all four podcast tabs were checked in the app against the user's account. Credentials and manual test binaries are excluded from the patch.

Keep only one enabled plugin folder with ID `netease-music`. An old copy under another folder name can take precedence at startup; moving it outside `plugins` or prefixing its folder name with `.` preserves a disabled backup.
