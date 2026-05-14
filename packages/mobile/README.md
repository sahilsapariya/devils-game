# @extraction/mobile

Operational runtime authority for **PROJECT EXTRACTION**.

This is the React Native (Expo) mobile app. It is the source of truth for
in-flight round state, announcements, and behavioral telemetry while the
device is offline. The backend is eventually consistent.

## Stack

- Expo SDK 51 + React Native 0.74
- TypeScript (strict)
- `expo-sqlite` for local persistence
- `expo-secure-store` for JWT storage
- `@react-navigation/native` (stack + tabs)

## Folders

```
src/
  components/   reusable UI primitives (OperationalButton, StatusDot, ...)
  config/       runtime configuration (env)
  db/           sqlite schema, connection, repositories
    repositories/
      rounds.repo.ts
      announcements.repo.ts
      telemetry.repo.ts
      consequences.repo.ts
      logs.repo.ts
  hooks/        cross-cutting hooks (useCountdown)
  navigation/   root navigator + types
  screens/      one file per top-level screen
  services/     external integrations (auth, api client, announcements)
  store/        React Context state containers
  theme/        colors, typography, spacing
  utils/        helpers (id, timestamps)
```

## Local development

```bash
# from monorepo root
npm install
npm --workspace @extraction/mobile run start
```

`expo start` boots Metro. Use the QR code with Expo Go on a physical
device, or press `i` / `a` for iOS/Android simulators.

Backend URL is configured via `app.json -> expo.extra.apiBaseUrl`
(default: `http://localhost:3001/api`).

## Type imports

Shared cross-subsystem types live in `@extraction/shared`. Examples:

```ts
import type { Round, OperationalState } from '@extraction/shared/types/models';
```

## Design constraints

- Monochrome surface. Operational red for critical signals only.
- Monospace primary typography. No decorative fonts.
- No emojis. No motivational copy. No friendly UX patterns.
- Subtle motion only. No bouncy springs.

## Pending wiring

The dashboard currently renders against mock state. Next phase work:

- Socket.io client + real-time round state subscription
- Backend round timer reconciliation with `useCountdown`
- Telemetry upload worker (drain `telemetry_queue`)
- Background service / persistent notification for round timer
- Push notification integration for announcements
