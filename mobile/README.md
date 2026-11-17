# Floor: mobile

The Floor phone app, for members, mentors and admins. Built with Expo (React Native).

The database and the web app are in `../web`. The project docs are in `../docs`. Setup and run commands
are in the README at the top of the repo.

## Run it

```powershell
npx expo start
```

Scan the QR code with the Expo Go app on your phone, or press `a` for an Android emulator. If the
phone cannot reach the computer, run `npx expo start --tunnel` instead.

With no `.env` file the app opens on a sample space, seen as its mentor, with no sign-in. Once `.env`
is filled in it opens on sign-in and shows the person's real space. `../docs/SETUP.md` has the steps.

Signing in, starting a space, the tabs, the three themes, Space look and Account work. The other buttons
are in place but not connected yet.

Some features need a development build instead of Expo Go, because they use native code that Expo Go
does not carry. The first one will be the live room. `../docs/STATUS.md` will say when.

## Check it

```powershell
npm test
npm run typecheck
npm run lint
```

`npm test` runs the tests of the app's plain logic in `tests/`.

`../checks/phone_sample.py` and `../checks/phone_sign_in.py` walk the app in Chrome at phone size, check
each step and save a picture of every screen. The first covers the sample space. The second covers sign-in
and starting a space, against a stand-in for Supabase. They need Python with Playwright, so they are run
on the build side, not on your computer.

## Where things are

- `src/app/`: screens. Every file is a route (Expo Router). `(tabs)` holds the tabs: Feed, Learn, Chat
  and Manage. Screens opened from Manage live in `(tabs)/manage/`.
- `src/components/`: the building blocks every screen shares: card, button, pill, text, the floating
  navigation, the screen frame with its lights.
- `src/features/`: the parts that belong to one area: `feed`, `manage`, `look`, `create`.
- `src/auth/`: sign-in. `authStore.ts` and `access.ts` hold the rules for one login at a time.
- `src/space/SpaceContext.tsx`: the space being shown and who is looking at it, loaded from the database.
- `src/lib/`: the Supabase connection, secure storage, the phone's id.
- `src/theme/themes.ts`: the three looks a mentor can choose: Night, Dawn and Smoke. Every colour in the
  app comes from here.
- `src/theme/layout.ts`: the few sizes shared by more than one component.

## Environment

Copy `.env.example` to `.env` and fill it in. `.env` is never committed.
