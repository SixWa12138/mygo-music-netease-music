English | [中文](README_ZH.md)

# NetEase Cloud Music for MyGo Music

Plays NetEase Cloud Music in [MyGo Music](https://github.com/egoist/mygo-music): search, playlists, albums, artists, charts, the daily mix, lyrics, comments and your library.

It isn't affiliated with or endorsed by NetEase. It uses the private API of the website, which NetEase may change at any time; when it does, the plugin has to change too. Read the copyright and disclaimer at the end before using it.

## Install

Put the folder in the app's plugins directory — **Settings > Plugins > + > Show Plugins Folder** — or drop it in there.

To put it on GitHub instead, paste the repository URL in Settings > Plugins, or use the link:

```
mygo-music://install-plugin?repo=SixWa12138/mygo-music-netease-music
```

## Signing in

Click Sign In in **Settings > Plugins**: a QR code shows in the app. Scan it with the NetEase Cloud Music phone app, then confirm on the phone — that's the only way in.

The session cookie (with `MUSIC_U`) is kept unencrypted in the plugin's data on this machine, and is only sent to `music.163.com`. Signing out forgets it. To end the session on NetEase's side, remove this device in the account's security settings.

## What works

Signed out:

- Search for songs, albums, artists and playlists, with suggestions while typing
- Home: today's picks, recommended playlists, new songs, charts
- Charts, new releases, and the playlist square's hot playlists
- Album, artist and playlist pages
- Playing (128k / 320k; a VIP song is a 45-second preview)
- Lyrics, with translations when the service has them, and song comments
- A station of songs similar to the last one

Signed in:

- Your playlists, liked songs, recently played, saved albums
- The daily mix, and personal radio
- Liking and unliking, posting comments, liking comments
- Creating, renaming and deleting playlists, adding and removing songs, reordering them
- Saving playlists, saving albums, following artists
- Lossless (flac) when the account has it

Not done: podcasts, videos, the cloud drive, listening together, the feed.

Plays are not reported back to NetEase, so its own listening charts don't move. The plugin keeps its own recent list of what was played on this machine.

## Sound

A track plays from the address the service hands out, with nothing converted: mp3 or flac as it is.

- standard: 128 kbps
- high: 320 kbps
- lossless: flac (with membership)

Signed out, or without membership, a VIP track comes back as a 45-second fragment. That's the service's own doing, not the plugin cutting it off.

## Lyrics

NetEase's own LRC, together with the translation (`tlyric`) when there is one. The app times them.

## Why there's encryption in the code

The website and the desktop app encrypt their requests in two different ways, and the plugin has to speak both:

- `weapi`: liking, comments, saving albums, following artists, creating and deleting playlists, reordering their tracks, recently played, the daily mix. AES-128-CBC twice, with the key wrapped in RSA.
- `eapi`: the ids of liked songs, saving a playlist, renaming a playlist, adding and removing its songs. AES-128-ECB once, with an MD5 inside the text, and some header fields the app sends.

The plugin's runtime has MD5 and AES-ECB (`host.crypto`) but no AES-CBC, so `index.js` carries a small AES-128-CBC of its own; the S-box is computed over the field rather than typed out. The RSA key is fixed, so its result is worked out once and kept as the constant `encSecKey`: the service only cares that it can recover the key, not that it's a new one every time.

The `X-antiCheatToken` in `eapi` is a constant from the client, and may change when NetEase ships a new version.

## Known limits

- Both the endpoints and the encryption are private to the website; a change at NetEase can break the plugin.
- Personal radio, your library, saving and commenting need a session; the daily mix is only yours when signed in.
- Regional licensing still applies: some songs are unplayable from some networks.
- A playlist over a thousand songs costs one more request when it opens, so it opens a little slower.
- Saving a playlist goes through `eapi` and the anti-cheat token, which a new client version can invalidate.

## Copyright and disclaimer

**Not an official project.** This is a personal, third-party project. It is not affiliated with, endorsed by, sponsored by, or in any way connected to NetEase Cloud Music, NetEase, Inc. or its affiliates. It is not an official client, and it does not represent NetEase. The name "NetEase Cloud Music" is used only to say which service the plugin talks to. It is also not an official MyGo Music plugin, and has no affiliation with MyGo Music's author or maintainers.

**Trademarks.** "NetEase Cloud Music", "网易云音乐" and the related names, logos, icons and interface designs are trademarks and/or copyrighted works of NetEase or their respective owners. Their use here is nominative, to refer to the service, and claims no rights. This repository contains no official assets, and claims no copyright in any of them.

**Content.** All music, audio, lyrics, translations, cover art, artist images, comments and other content reached through this plugin belong to NetEase Cloud Music and the respective rights holders — labels, songwriters, performers and others. This project does not store, host, mirror or distribute any of it. The plugin runs on your own computer, with your own account, asks NetEase's own API for data, and hands the playback address the service returns to the player. No content is shipped with this repository.

**No circumvention.** The plugin does not offer, and does not attempt, cracking, ad removal, bypassing payment, membership or regional restrictions, bulk downloading, or exporting audio or lyrics. Whether a track plays, at what bitrate, and for how long as a preview is decided entirely by NetEase's servers from your account and region; the plugin only passes on what the service answers.

**Scope of use.** For personal study, research and private use only. Do not use the plugin, or a modified version of it, commercially, as a public service, for bulk scraping, for hoarding data, for redistribution, or in any way that breaks NetEase's terms of service or the laws where you live. You are responsible for what you do with it.

**Account and privacy.** The plugin collects nothing and uploads nothing. The session cookie is kept in plain text in the plugin's data folder on your own machine, and is only sent to `music.163.com`; signing out deletes it. Keep your computer and your account safe yourself.

**License.** The plugin's code is shared for personal study, research and private use; no other license is granted. To republish it, distribute a modified version, or use it commercially, ask the author first.

**No warranty.** Provided "as is", without any express or implied warranty, including availability, stability, legality or fitness for a particular purpose. The author is not liable for any direct or indirect loss arising from using, or being unable to use, this project.

**Notices and takedown.** No infringement is intended. If a rights holder believes something here — a name, a description or code — infringes their rights, please open an issue on the repository; the material will be changed or removed, and distribution stopped, once verified.

**Terms.** By using this project you confirm that you have read and accepted the above, and that you will follow NetEase's terms of service and copyright notice, and the laws of your country or region. If you do not agree, please do not use it.

