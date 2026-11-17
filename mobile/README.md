# Floor: mobile

The Floor phone app, for members, mentors and admins. Built with Expo (React Native).

The database and the web app are in `../web`. The project docs are in `../docs`. Setup and run commands
are in the README at the top of the repo.

## Run it

```powershell
npx expo start
```

Scan the QR code with the Expo Go app on your phone, or press `a` for an Android emulator.

Some features need a development build instead of Expo Go, because they use native code that Expo Go
does not carry. The first one will be the live room. `../docs/STATUS.md` will say when.

## Check it

```powershell
npx tsc --noEmit
```

## Where things are

- `src/app/`: screens. Every file is a route (Expo Router).
- `src/theme/themes.ts`: the three looks a mentor can choose: Night, Dawn and Smoke.

## Environment

Copy `.env.example` to `.env` and fill it in. `.env` is never committed.
