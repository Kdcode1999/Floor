# Floor: mobile

The Floor phone app, for members, mentors and admins. Built with Expo (React Native).

The database and the web app are in `../web`. The project docs are in `../docs`. Setup and run commands
are in the README at the top of the repo.

## Run it

```powershell
npx expo start
```

Open the Floor app on your phone: the development build from `../docs/SETUP.md`, step 6. It finds
the computer on the same Wi-Fi. If it cannot, run `npx expo start --tunnel` instead.

For a quick look at the screens without a build, Expo Go still works:

```powershell
npx expo start --go
```

Expo Go does not carry everything the app uses. It gets no alerts, and the app says so there
instead of loading that part.

With no `.env` file the app opens on a sample space, seen as its mentor, with no sign-in. Once `.env`
is filled in it opens on sign-in and shows the person's real space. `../docs/SETUP.md` has the steps.

`../docs/STATUS.md` says which parts work today.

A new build is needed only when `package.json` or `app.json` changes. `../docs/STATUS.md` says when.

## Check it

```powershell
npm test
npm run typecheck
npm run lint
```

`npm test` runs the tests of the app's plain logic in `tests/`.

The scripts in `../checks/` walk the app in Chrome at phone size, check each step and save a picture of
every screen. `../checks/README.md` lists them. They need Python with Playwright, so they are run on the
build side, not on your computer.

## Where things are

- `src/app/`: screens. Every file is a route (Expo Router). `(tabs)` holds the tabs: Feed, Learn, Chat
  and Manage. Screens opened from Manage live in `(tabs)/manage/`.
- `src/components/`: the building blocks every screen shares: card, button, pill, text, the floating
  navigation, the screen frame with its lights.
- `src/features/`: the parts that belong to one area, one folder each. `api.ts` is what it asks the
  database, `logic.ts` is its wording and sums.
- `src/auth/`: sign-in. `authStore.ts` and `access.ts` hold the rules for one login at a time.
- `src/space/SpaceContext.tsx`: the space being shown and who is looking at it, loaded from the database.
- `src/lib/`: the Supabase connection, secure storage, the phone's id.
- `src/theme/themes.ts`: the three looks a mentor can choose: Night, Dawn and Smoke. Every colour in the
  app comes from here.
- `src/theme/layout.ts`: the few sizes shared by more than one component.

## Settings

- `.env`: copy `.env.example` and fill it in. Never committed.
- `app.json`: everything about the app itself: name, store id, icons, permissions.
- `app.config.js`: adds `google-services.json` to the Android settings once that file exists.
- `eas.json`: the three kinds of build. `development` runs from your computer, `preview` is a
  finished app for testers, `production` is for the stores.
