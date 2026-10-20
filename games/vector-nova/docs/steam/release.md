# Steam release plan

Status: planning only. Keep polishing VECTOR//NOVA before committing to a Steam release. No release date is set.

Requirements checked on 2026-10-18; recheck Valve's current rules before paying fees or scheduling launch.

## Proposed first release

- Package the existing Three.js/Vite game with Electron, retaining the browser version and shared game code.
- Start with Windows. Add macOS, Linux or Steam Deck support after testing those targets.
- Consider a US base price of **$1.99**. This is a tentative preference over $0.99, preserving the inexpensive-game goal with more discount flexibility.
- Keep achievements, leaderboards and Steam Cloud optional for the first release.

## 1. Build a desktop package

- [ ] Add an Electron shell around the production game build.
- [ ] Bundle tracks, ships, textures, music, decoders and other runtime resources locally; verify the game launches and plays offline.
- [ ] Configure local asset loading, application identity, icons and versioning.
- [ ] Keep renderer access to native capabilities restricted to what the game needs.
- [ ] Produce a repeatable Windows package and test it on a clean machine without development tools.

Electron embeds Chromium and supports Windows, macOS and Linux. Each advertised platform still needs its own build and verification. Packaging does not itself solve GPU memory limits or first-use loading hitches.

References: [Electron overview](https://www.electronjs.org/docs/latest/), [application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution), [security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## 2. Finish the desktop experience

- [ ] Add fullscreen/windowed settings and a Quit button.
- [ ] Verify settings persist across restarts and package updates.
- [ ] Complete controller navigation through menus, track/ship selection, racing, pause, settings and results. Existing driving inputs are a starting point, not proof of full controller support.
- [ ] Check keyboard navigation, controller disconnect/reconnect, alt-tab, audio and window resizing.
- [ ] Test all 13 tracks, repeated races, track switching and the standalone ship inspector on representative Windows hardware.
- [ ] Measure startup, frame pacing and memory use; establish minimum and recommended system requirements from testing.

First milestone: a friend can install the Windows build, launch it offline and play entirely with a controller.

## 3. Review assets and disclosures

- [ ] Audit shipped assets and dependencies against the [asset manifest](../ASSET_MANIFEST.json) and underlying licence/provenance records.
- [ ] Confirm commercial redistribution rights for music, imagery, models, fonts and third-party code; include required notices in the package.
- [ ] Complete Steam's content survey, including accurate disclosure of generated artwork and music consumed by players.

The project already records generated imagery/music and third-party materials. Those records help the review but do not replace checking the applicable terms. Steam evaluates pre-generated AI content under its normal content and rights requirements; disclosure is not an automatic rejection.

Reference: [Steam content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey).

## 4. Register with Steamworks when ready

- [ ] Choose the legal individual or entity publishing the game.
- [ ] Complete identity verification, banking and tax information, and the Steamworks agreements.
- [ ] Pay the Steam Direct fee and create the game's application entry.

Valve permits an individual to onboard as a sole proprietor; incorporation is not a Steam requirement. The fee is **$100 per product**, potentially plus applicable tax. It is non-refundable but recoupable after the product reaches **$1,000 in adjusted gross revenue**, under Valve's terms. Sales proceeds are also subject to the distribution agreement's revenue share, taxes, refunds and other applicable adjustments.

References: [onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding), [Steam Direct fee](https://partner.steamgames.com/doc/gettingstarted/appfee).

## 5. Prepare the store page and build delivery

- [ ] Write the description around features available at launch.
- [ ] Prepare gameplay screenshots, capsule/library artwork, icons and a short gameplay trailer.
- [ ] Enter supported platforms, languages, system requirements, content disclosures and regional pricing.
- [ ] Upload the packaged build through Steam's tools and configure its launch executable.
- [ ] Test installation and launching through Steam, offline behaviour and delivery of an update.
- [ ] Submit the store page and build for Valve review, leaving time for feedback and corrections.

Steamworks upload tools are needed for distribution. In-game API features such as achievements and leaderboards are optional; they need not delay an otherwise complete release.

References: [uploading to Steam](https://partner.steamgames.com/doc/sdk/uploading), [Steamworks SDK](https://partner.steamgames.com/doc/sdk), [pricing](https://partner.steamgames.com/doc/store/pricing), [review process](https://partner.steamgames.com/doc/store/review_process).

## 6. Schedule and release

- [ ] Make the approved Coming Soon page public and start collecting wishlists.
- [ ] Meet both timing requirements: at least **30 days after paying the app fee** for an initial release, and a public Coming Soon page for at least **two weeks**. These periods can overlap.
- [ ] Finish external playtesting and resolve release-blocking issues.
- [ ] Confirm the final price, release date, approved build and store claims before publishing.
- [ ] Plan how to receive bug reports and ship updates after launch.

Valve reviews both the store presence and the build. Store review typically takes 3–5 business days; Valve recommends submitting the page at least seven business days before the intended page launch. Allow additional time for corrections and build review. The waiting periods are minimums, not a promise that the game will be ready in 30 days.

References: [Steam Direct publishing requirements](https://partner.steamgames.com/steamdirect/), [review process](https://partner.steamgames.com/doc/store/review_process).
