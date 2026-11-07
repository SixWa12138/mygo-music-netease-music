import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
let sequence = 0;

async function setup(handler, signedIn = true) {
  const storage = new Map(signedIn ? [["cookie", "MUSIC_U=test-session; __csrf=test-csrf; NMTID=test-device"]] : []);
  globalThis.host = {
    storage: { get: key => storage.get(key), set: (key, value) => storage.set(key, value), remove: key => storage.delete(key) },
    crypto: {
      md5: text => createHash("md5").update(text).digest("hex"),
      aesEcbEncrypt: (key, text) => {
        const cipher = createCipheriv("aes-128-ecb", key, null);
        return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("hex");
      },
    },
  };
  globalThis.fetch = async (url, init) => {
    const address = new URL(url);
    assert.ok(manifest.permissions.network.some(pattern => pattern === address.hostname || (pattern.startsWith("*.") && address.hostname.endsWith(pattern.slice(1)))), `Missing network permission for ${address.hostname}`);
    const body = await handler(address, init);
    return { ok: true, status: 200, json: async () => body };
  };
  return import(`./index.js?test=${++sequence}`);
}

function request(url, init) {
  assert.equal(url.origin, "https://interfacepc.music.163.com");
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  const cipher = createDecipheriv("aes-128-ecb", "e82ckenh8dichen8", null);
  const params = new URLSearchParams(init.body).get("params");
  const text = Buffer.concat([cipher.update(Buffer.from(params, "hex")), cipher.final()]).toString("utf8");
  const [path, json, digest] = text.split("-36cd479b6b5-");
  assert.equal(url.pathname, path.replace(/^\/api\//, "/eapi/"));
  assert.equal(digest, createHash("md5").update(`nobody${path}use${json}md5forencrypt`).digest("hex"));
  const body = JSON.parse(json);
  assert.equal(body.e_r, false);
  return body;
}

const song = id => ({ id, name: `Song ${id}`, ar: [], al: {}, dt: 180000 });

test("song search keeps album artwork from the fields returned by search", async () => {
  const plugin = await setup(url => {
    assert.equal(url.pathname, "/api/cloudsearch/pc");
    return {
      code: 200,
      result: {
        songCount: 1,
        songs: [
          { id: 1, name: "Primary", ar: [], album: { id: 11, name: "Album", picUrl: "http://p1.music.126.net/primary.jpg" } },
        ],
      },
    };
  });
  const result = await plugin.search({ query: "song", kind: "tracks", offset: 0 });
  assert.equal(result.tracks[0].album.imageUrl, "https://p1.music.126.net/primary.jpg");
});

// Each personal podcast tab must call its own client endpoint and keep its content playable.
test("personal podcast tabs show created, purchased and liked content with pagination", async () => {
  const calls = [];
  const plugin = await setup((url, init) => {
    if (url.pathname === "/api/nuser/account/get") return { code: 200, profile: { userId: 9 } };
    const body = request(url, init); calls.push({ path: url.pathname, body });
    if (url.pathname === "/eapi/djradio/get/create/sub/count") { assert.equal(body.userId,9); return {code:200,createRadioCount:2,subRadioCount:18}; }
    if (url.pathname === "/eapi/content/my/liked/voice/count") return {code:200,data:12};
    if (url.pathname === "/eapi/voicelist/bought/list") return {code:200,data:{count:1,hasMore:false,list:[{id:81,name:"Purchased",productType:0}]}};
    if (url.pathname === "/eapi/djradio/get/byuser/v1") return {code:200,djRadios:[{id:82,name:"Created"}],hasMore:false};
    if (url.pathname === "/eapi/djradio/get/subed") return {code:200,djRadios:[{id:83,name:"Subscribed"}],hasMore:false};
    if (url.pathname === "/eapi/content/my/liked/voice") return {code:200,data:{hasMore:body.offset===0,data:[{voiceId:84,voiceName:"Liked voice",trackId:85,duration:1200}]}};
    assert.fail(url.pathname);
  });
  for (const [page,id] of [["my-podcasts","83"],["my-podcasts:created","82"],["my-podcasts:purchased","81"]]) {
    const result = await plugin.browse({page});
    assert.equal(result.sections[0].shows[0].id,id);
    assert.equal(result.navigationPage,"my-podcasts");
    assert.equal(result.tabs.filter(t=>t.selected).length,1);
    assert.equal(result.tabs.find(t=>t.selected).page,page);
  }
  const liked = await plugin.browse({page:"my-podcasts:liked"});
  assert.equal(liked.sections[0].tracks[0].id,"dj:84");
  assert.equal(liked.sections[0].tracks[0].unavailable,undefined);
  const next = await plugin.browse({page:liked.sections[1].links[0].page});
  assert.equal(calls.at(-1).body.offset,1);
  assert.equal(next.tabs.find(t=>t.selected).page,"my-podcasts:liked");
  await assert.rejects(plugin.browse({page:"my-podcasts:liked:99999999999999999999"}));
  const guest = await setup(()=>assert.fail("No signed-out library request"),false);
  await assert.rejects(guest.browse({page:"my-podcasts"}),{code:"signIn"});
});

const selectedFile = {id:"selected", name:"本地歌曲.FLAC", size:1234, md5:"a".repeat(32), title:"Title", artist:"Artist", album:"Album"};

// All picker audio formats keep their extension and media type when sent to NOS.
test("cloud upload accepts every requested audio format but not CUE text", async () => {
  const types={mp3:"audio/mpeg",aac:"audio/aac",wma:"audio/x-ms-wma",wav:"audio/wav",ogg:"audio/ogg",m4a:"audio/mp4",ape:"audio/x-ape",flac:"audio/flac"};
  for (const [ext,type] of Object.entries(types)) {
    const plugin=await setup((url,init)=>{
      if(url.hostname==="wanproxy.127.net")return {upload:["https://nosup-hz1.127.net"]};
      const body=request(url,init);
      if(url.pathname==="/eapi/cloud/upload/check")return {code:200,needUpload:true,songId:42};
      if(url.pathname==="/eapi/nos/token/alloc"){assert.equal(body.ext,ext);return {code:200,result:{resourceId:"resource",objectKey:"audio",token:"token"}};}
      return {code:200,songId:43};
    });
    host.uploadCheckpoint=()=>{};
    host.uploadFile=async opts=>{assert.equal(opts.headers["Content-Type"],type);return {offset:1234};};
    await plugin.upload({file:{...selectedFile,name:`song.${ext.toUpperCase()}`}});
    await assert.rejects(plugin.upload({file:{...selectedFile,name:"album.flac.cue"}}));
  }
});

// An upload is published only after the selected file reaches NOS and its metadata is accepted.
test("cloud upload streams the selected file without account cookies and publishes it", async () => {
  for (const needUpload of [true,false]) {
    const paths=[], transfers=[];
    const plugin = await setup((url,init)=>{
      paths.push(url.pathname);
      if (url.hostname==="wanproxy.127.net") {
        assert.equal(init.headers,undefined);
        return {upload:["http://nosup-hz1.127.net"]};
      }
      const body=request(url,init);
      if (url.pathname==="/eapi/cloud/upload/check") {assert.equal(body.md5,selectedFile.md5); assert.equal(body.length,1234);return {code:200,needUpload,songId:42};}
      if (url.pathname==="/eapi/nos/token/alloc") { assert.equal(body.ext,"flac");return {code:200,result:{resourceId:"resource",objectKey:"audio/a.flac",token:"nos-only"}};}
      if (url.pathname==="/eapi/upload/cloud/info/v2") {assert.equal(body.song,"Title");assert.equal(body.resourceId,"resource");return {code:200,songId:43};}
      assert.equal(url.pathname,"/eapi/cloud/pub/v2");assert.equal(body.songid,43);return {code:200};
    });
    host.uploadCheckpoint=id=>assert.equal(id,"selected");
    host.uploadFile=async opts=>{
      transfers.push(opts);
      assert.equal(opts.id,"selected");
      assert.equal(new URL(opts.url).origin,"https://nosup-hz1.127.net");
      assert.ok(opts.url.includes("audio%2Fa.flac"));
      assert.deepEqual(Object.keys(opts.headers).sort(),["Content-MD5","Content-Type","x-nos-token"]);
      assert.equal(opts.headers["x-nos-token"],"nos-only");
      return {offset:1234};
    };
    await plugin.upload({file:selectedFile});
    assert.equal(transfers.length,needUpload?1:0);
    assert.equal(paths.at(-1),"/eapi/cloud/pub/v2");
    assert.equal(paths.includes("/lbs"),needUpload);
  }
});

// Failed, cancelled and redirected uploads must never claim a published cloud song.
test("cloud upload rejects unsafe servers, incomplete bytes and cancelled selections", async () => {
  for (const failure of ["server","partial","cancel","network"]) {
    const paths=[];
    const plugin=await setup((url,init)=>{
      paths.push(url.pathname);
      if(url.hostname==="wanproxy.127.net") return {upload:[failure==="server"?"https://127.net.evil.invalid":"https://nosup-hz1.127.net"]};
      request(url,init);
      if(url.pathname==="/eapi/cloud/upload/check")return {code:200,needUpload:true,songId:42};
      if(url.pathname==="/eapi/nos/token/alloc")return {code:200,result:{resourceId:"resource",objectKey:"audio",token:"nos-only"}};
      assert.fail("Failed upload must not publish metadata");
    });
    let checks=0;
    host.uploadCheckpoint=()=>{if(failure==="cancel"&&++checks>1)throw new Error("cancelled");};
    host.uploadFile=async()=>{if(failure==="network")throw new Error("offline");return {offset:12};};
    await assert.rejects(plugin.upload({file:selectedFile}));
    assert.ok(!paths.includes("/eapi/cloud/pub/v2"));
  }
});
const audio = (level = "exhigh") => ({
  id: 42, code: 200, url: "http://m1.music.126.net/song", type: level === "lossless" ? "flac" : "mp3",
  level, br: level === "lossless" ? 1000000 : 320000, size: 12345, gain: -2.5, peak: 0.9,
});

// The web endpoint refused hearts; both directions must reach the client API and update the library.
test("hearts add and remove a song in liked music", async () => {
  const ids = new Set([42, 7]);
  const changes = [];
  const plugin = await setup((url, init) => {
    if (url.pathname === "/api/nuser/account/get") return { code: 200, profile: { userId: 9 } };
    if (url.pathname === "/api/user/playlist") return { code: 200, playlist: [{ id: 90, specialType: 5 }] };
    if (url.pathname === "/api/v6/playlist/detail") return { code: 200, playlist: { trackIds: [{ id: 7 }, { id: 42 }] } };
    if (url.pathname === "/api/v3/song/detail") {
      return { code: 200, songs: JSON.parse(url.searchParams.get("c")).map(({ id }) => song(id)) };
    }
    const body = request(url, init);
    assert.equal(body.header.MUSIC_U, "test-session");
    assert.equal(body.header.__csrf, "test-csrf");
    assert.equal(body.header.NMTID, "test-device");
    assert.match(init.headers.cookie, /MUSIC_U=test-session/);
    if (url.pathname === "/eapi/song/like/get") return { code: 200, ids: [...ids] };
    assert.equal(url.pathname, "/eapi/radio/like");
    assert.equal(body.trackId, 42);
    assert.equal(typeof body.like, "boolean");
    changes.push(body.like);
    if (body.like) ids.add(body.trackId);
    else ids.delete(body.trackId);
    return { code: 200 };
  });
  assert.deepEqual(await plugin.isLiked({ ids: ["42", "7"] }), { 42: true, 7: true });
  assert.deepEqual((await plugin.liked({ offset: 0 })).tracks.map(track => track.id), ["7", "42"]);
  await plugin.like({ id: "42", on: true });
  assert.ok(ids.has(42));
  assert.deepEqual(await plugin.isLiked({ ids: ["42", "7"] }), { 42: true, 7: true });
  assert.deepEqual((await plugin.liked({ offset: 0 })).tracks.map(track => track.id), ["42", "7"]);
  await plugin.like({ id: "42", on: false });
  assert.ok(!ids.has(42));
  assert.deepEqual((await plugin.liked({ offset: 0 })).tracks.map(track => track.id), ["7"]);
  assert.deepEqual(changes, [true, false]);
});

// Rejected mutations must not create a heart that only exists in the local cache.
test("a rejected heart preserves the cached liked state", async () => {
  for (const code of [301, 405]) {
    const plugin = await setup((url, init) => {
      if (url.pathname === "/api/nuser/account/get") return { code: 200, profile: { userId: 9 } };
      if (url.pathname === "/api/user/playlist") return { code: 200, playlist: [{ id: 90, specialType: 5 }] };
      if (url.pathname === "/api/v6/playlist/detail") return { code: 200, playlist: { trackIds: [{ id: 42 }] } };
      request(url, init);
      return url.pathname === "/eapi/song/like/get" ? { code: 200, ids: [42] } : { code };
    });
    assert.deepEqual(await plugin.isLiked({ ids: ["42"] }), { 42: true });
    await assert.rejects(plugin.like({ id: "42", on: false }), code === 301 ? { code: "signIn" } : /405/);
    assert.deepEqual(await plugin.isLiked({ ids: ["42"] }), { 42: true });
  }
  const guest = await setup(() => assert.fail("A signed-out heart must not send a request"), false);
  await assert.rejects(guest.like({ id: "42", on: true }), { code: "signIn" });
});

// Playback must use the requested client quality and keep login cookies out of CDN requests.
test("stream uses the client API for every quality", async () => {
  for (const [quality, level, encode] of [["standard", "standard", "mp3"], ["high", "exhigh", "mp3"], ["lossless", "lossless", "flac"]]) {
    const plugin = await setup((url, init) => {
      const body = request(url, init);
      assert.equal(url.pathname, "/eapi/song/enhance/player/url/v1");
      assert.deepEqual(JSON.parse(body.ids), [42]);
      assert.equal(body.level, level);
      assert.equal(body.encodeType, encode);
      assert.equal(body.header.MUSIC_U, "test-session");
      return { code: 200, data: [audio(level)] };
    });
    const stream = await plugin.stream({ id: "42", quality });
    assert.equal(stream.url, "https://m1.music.126.net/song");
    assert.equal(stream.type, encode);
    assert.equal(stream.quality, quality);
    assert.equal(stream.size, 12345);
    assert.equal(stream.gain, -2.5);
    assert.equal(stream.peak, 0.9);
    assert.equal(stream.headers.referer, "https://music.163.com/");
    assert.ok(!Object.keys(stream.headers).some(key => key.toLowerCase() === "cookie"));
  }
});

// Missing audio can fall back once per lower level, but must never play a different song or an error entry.
test("stream falls back for missing audio and rejects unavailable songs", async () => {
  const tried = [];
  const plugin = await setup((url, init) => {
    const body = request(url, init);
    if (!url.pathname.endsWith("/v1")) return { code: 200, data: [] };
    tried.push(body.level);
    return { code: 200, data: body.level === "lossless" ? [{ id: 42, url: null }] : [audio()] };
  });
  assert.equal((await plugin.stream({ id: "42", quality: "lossless" })).quality, "high");
  assert.deepEqual(tried, ["lossless", "exhigh"]);
  for (const data of [[], [{ ...audio(), id: 99 }], [{ ...audio(), code: 404 }]]) {
    const levels = [];
    const missing = await setup((url, init) => {
      const body = request(url, init);
      if (url.pathname.endsWith("/v1")) levels.push(body.level);
      return { code: 200, data };
    });
    await assert.rejects(missing.stream({ id: "42", quality: "high" }), { code: "unavailable" });
    assert.deepEqual(levels, ["exhigh", "standard"]);
  }
});

// Switching endpoints keeps the existing guest preview behavior and sends no account credentials.
test("guests can still play the preview supplied by NetEase", async () => {
  const plugin = await setup((url, init) => {
    const body = request(url, init);
    assert.equal(body.header.MUSIC_U, undefined);
    assert.ok(!init.headers.cookie.includes("MUSIC_U="));
    return { code: 200, data: [{ ...audio("standard"), freeTrialInfo: { start: 0, end: 45 } }] };
  }, false);
  assert.equal((await plugin.stream({ id: "42", quality: "standard" })).quality, "standard");
});

// A catalog restriction greyed out the song even though the listener had an uploaded copy.
test("cloud copies in playlists remain playable despite catalog restrictions", async () => {
  const restricted = { ...song(42), noCopyrightRcmd: { type: 3 } };
  const cloud = { ...restricted, pc: { privateCloud: { songId: 42 } } };
  const plugin = await setup(url => {
    if (url.pathname === "/api/nuser/account/get") return { code: 200, profile: { userId: 9 } };
    assert.equal(url.pathname, "/api/v6/playlist/detail");
    return { code: 200, playlist: { id: 8, tracks: [cloud, { ...restricted, id: 7 }] } };
  });
  const { tracks } = await plugin.playlist({ id: "8" });
  assert.ok(!tracks[0].unavailable, "The uploaded copy must be clickable");
  assert.equal(tracks[1].unavailable, true, "A restriction without a cloud copy still applies");
});

// The v1 endpoint rejected a cloud song whose older client endpoint returned the uploaded audio.
test("cloud audio falls back to the bitrate endpoint without needing to reload its playlist", async () => {
  for (const failed of [{ code: 405, message: "当前环境异常" }, { code: 200, data: [{ id: 42, url: null }] }]) {
    for (const [quality, level, br] of [["standard", "standard", 128000], ["high", "exhigh", 320000], ["lossless", "lossless", 999000]]) {
      const paths = [];
      const plugin = await setup((url, init) => {
        const body = request(url, init);
        paths.push(url.pathname);
        assert.deepEqual(JSON.parse(body.ids), [42]);
        if (url.pathname.endsWith("/v1")) return failed;
        assert.equal(url.pathname, "/eapi/song/enhance/player/url");
        assert.equal(body.br, br);
        return { code: 200, data: [{ ...audio(level), type: quality === "lossless" ? "FLAC" : "MP3" }] };
      });
      const result = await plugin.stream({ id: "42", quality });
      assert.equal(result.type, quality === "lossless" ? "flac" : "mp3");
      assert.equal(result.quality, quality);
      assert.deepEqual(paths, ["/eapi/song/enhance/player/url/v1", "/eapi/song/enhance/player/url"]);
    }
  }
});

// A missing login must not trigger another playback request; an empty fallback must retain the API error.
test("audio fallback preserves authentication and service failures", async () => {
  const signedOut = await setup((url, init) => {
    request(url, init);
    assert.ok(url.pathname.endsWith("/v1"), "Do not retry expired credentials");
    return { code: 301 };
  });
  await assert.rejects(signedOut.stream({ id: "42", quality: "high" }), { code: "signIn" });
  const failed = await setup((url, init) => {
    request(url, init);
    return url.pathname.endsWith("/v1") ? { code: 405, message: "当前环境异常" } : { code: 200, data: [] };
  });
  await assert.rejects(failed.stream({ id: "42", quality: "high" }), /当前环境异常/);
});

const radio = { id: 8, name: "Podcast", picUrl: "http://p1.music.126.net/cover.jpg", programCount: 2, dj: { nickname: "Host" } };
const program = { id: 99, name: "Episode", radio, mainSong: song(42), duration: 180000, description: "Description", createTime: 1767225600000 };

// Discovery cards must open real podcast pages, and all subscription pages must be retained.
test("podcast discovery and subscriptions return native shows", async () => {
  const offsets = [];
  const plugin = await setup((url, init) => {
    const body = request(url, init);
    if (url.pathname.endsWith("/get/subed")) {
      offsets.push(body.offset);
      return { code: 200, djRadios: [{ ...radio, id: body.offset ? 9 : 8 }], hasMore: body.offset === 0 };
    }
    assert.ok(["/eapi/djradio/recommend/v1", "/eapi/djradio/hot/v1"].includes(url.pathname));
    return { code: 200, djRadios: [radio] };
  });
  const page = await plugin.browse({ page: "podcasts" });
  assert.equal(page.sections[0].shows[0].id, "8");
  assert.equal(page.sections[1].shows[0].imageUrl, "https://p1.music.126.net/cover.jpg");
  assert.deepEqual((await plugin.shows()).map(show => [show.id, show.subscribed]), [["8", true], ["9", true]]);
  assert.deepEqual(offsets, [0, 1]);
});

// Program IDs identify comments and saved queues; only mainSong IDs identify audio streams.
test("podcast episodes keep their program identity while playing the underlying audio", async () => {
  const plugin = await setup((url, init) => {
    if (url.pathname.startsWith("/api/v1/resource/comments/")) {
      assert.equal(url.pathname, "/api/v1/resource/comments/A_DJ_1_99");
      return { code: 200, comments: [], total: 0 };
    }
    const body = request(url, init);
    if (url.pathname === "/eapi/djradio/get") return { code: 200, djRadio: radio };
    if (url.pathname === "/eapi/dj/program/byradio") {
      assert.equal(body.radioId, 8);
      assert.equal(body.offset, 30);
      return { code: 200, programs: [program], more: true };
    }
    if (url.pathname === "/eapi/dj/program/detail") {
      assert.equal(body.id, 99);
      return { code: 200, program };
    }
    assert.equal(url.pathname, "/eapi/song/enhance/player/url/v1");
    assert.deepEqual(JSON.parse(body.ids), [42]);
    return { code: 200, data: [audio()] };
  });
  const page = await plugin.show({ id: "8", offset: 30 });
  const track = page.episodes[0];
  assert.equal(track.id, "dj:99");
  assert.equal(track.showId, "8");
  assert.equal(track.duration, 180000);
  assert.equal(track.album.id, "");
  assert.ok(page.more);
  assert.equal((await plugin.stream({ id: track.id, quality: "high" })).type, "mp3");
  await plugin.comments({ trackId: track.id, offset: 0 });
  assert.deepEqual(await plugin.lyrics({ id: track.id }), { lrc: "" });
  plugin.played({ id: "7" });
  plugin.played({ id: track.id });
  assert.equal(host.storage.get("lastPlayed"), "7");
  assert.deepEqual(host.storage.get("recent"), ["dj:99", "7"]);
  await assert.rejects(plugin.addToPlaylist({ id: "1", trackIds: [track.id] }), { code: "unsupported" });
});

// Subscribe and unsubscribe must use booleans, while private pages require a session.
test("podcast subscriptions write both directions and private tabs require login", async () => {
  const changes = [];
  const plugin = await setup((url, init) => {
    assert.equal(url.pathname, "/eapi/djradio/sub");
    const body = request(url, init);
    assert.equal(body.id, 8);
    changes.push(body.sub);
    return { code: 200 };
  });
  await plugin.subscribeShow({ id: "8", on: true });
  await plugin.subscribeShow({ id: "8", on: false });
  assert.deepEqual(changes, [true, false]);
  const guest = await setup(() => assert.fail("Signed-out private pages must not fetch"), false);
  await assert.rejects(guest.shows(), { code: "signIn" });
  await assert.rejects(guest.browse({ page: "cloud" }), { code: "signIn" });
  await assert.rejects(guest.subscribeShow({ id: "8", on: true }), { code: "signIn" });
});

// Uploaded files remain playable even when their matched catalog song has been removed.
test("cloud pages preserve uploaded tracks and expose working next and previous pages", async () => {
  const offsets = [];
  const plugin = await setup((url, init) => {
    assert.equal(url.pathname, "/eapi/v1/cloud/get");
    const body = request(url, init);
    offsets.push(body.offset);
    return {
      code: 200, count: 3, hasMore: body.offset === 0,
      data: body.offset === 0 ? [
        { songId: 42, songName: "Uploaded", simpleSong: { ...song(42), noCopyrightRcmd: { type: 3 } } },
        { songId: 43, fileName: "Unknown.mp3", album: "Personal", artist: "Uploader" },
      ] : [{ songId: 44, songName: "Last" }],
    };
  });
  const first = await plugin.browse({ page: "cloud" });
  assert.deepEqual(first.sections[0].tracks.map(t => [t.id, Boolean(t.unavailable)]), [["42", false], ["43", false]]);
  assert.equal(first.sections[0].tracks[1].name, "Unknown.mp3");
  const next = first.sections[1].links[0].page;
  const last = await plugin.browse({ page: next });
  assert.equal(last.sections[0].tracks[0].id, "44");
  assert.equal(last.sections[1].links[0].page, "cloud:0");
  assert.deepEqual(offsets, [0, 2]);
  await assert.rejects(plugin.browse({ page: "cloud:9999999999999999999999999999999" }), { code: "unavailable" });
});

// Restored podcast history must retain episode metadata instead of becoming a song or disappearing.
test("recent history restores podcast episodes alongside songs", async () => {
  const plugin = await setup((url, init) => {
    if (url.pathname === "/api/v3/song/detail") return { code: 200, songs: [song(7)] };
    assert.equal(url.pathname, "/eapi/dj/program/detail");
    assert.equal(request(url, init).id, 99);
    return { code: 200, program };
  }, false);
  plugin.played({ id: "7" });
  plugin.played({ id: "dj:99" });
  const tracks = await plugin.recent();
  assert.deepEqual(tracks.map(t => t.id), ["dj:99", "7"]);
  assert.equal(tracks[0].showId, "8");
  assert.equal(tracks[0].name, "Episode");
});
