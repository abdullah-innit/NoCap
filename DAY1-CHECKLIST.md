# Day 1 desk checklist

## Team split for today

- **You + this laptop:** keep Docker running, build the API and Android app, make every checkpoint push, and show the judge the phone.
- **Teammate 2 + Ubuntu laptop:** verify the API health and core flows, record exact errors and screenshots, and check the rules checklist with the venue volunteer. A browser and terminal are enough for this task; no large installation is needed before evaluation.
- **Teammate 3 + Windows laptop:** open the mobile app in Expo Go, walk through each screen with the phone holder, record any exact error screen, and tell you. Confirm with the venue volunteer that the public repository URL is registered. They do not need to install Docker before today's evaluation.

## Before the judge arrives

1. Keep this laptop and phone on the same Wi-Fi or hotspot.
2. Set `DAY1_SALT` in the terminal from the team sheet, then run `docker compose up -d --build` in this repository. Never put the salt in a file or message.
3. Confirm `http://localhost:8080/health` shows `{"status":"ok"}`.
4. Open Expo Go → Enter URL → `exp://172.15.4.149:8082` while on this laptop's Wi-Fi. If an APK is ready, install `mobile/release/app-release.apk` instead. In the app server field, set `http://172.15.4.149:8080`. Recheck this laptop's Wi-Fi IP after changing networks.
5. Sign in as Viewer and open Fixtures, Standings, Club, Store. As Manager, tap **Prepare demo roster** while online. As Organizer, open Scoring.
6. Turn on airplane mode, open cached screens, queue a score or roster action, force-close and reopen, then reconnect and tap **Sync now**.
7. Use only mock payment token `tok_success` for the store demo. No real money is involved.

## Live deadlines from Part I booklet

- Push one commit during **13:45–14:45 PKT**.
- Stop coding by **15:00 PKT**. Push the final commit by **15:05 PKT**.
- Judges begin desk visits at **15:15 PKT**; your team gets a fixed 10-minute slot.

If Docker fails: restart Docker Desktop, run `docker compose up -d --build`, then check `docker compose logs --tail 50 api`. If the phone cannot reach the API, check its Settings address and the shared network.
