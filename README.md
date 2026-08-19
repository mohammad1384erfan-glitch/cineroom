# CineRoom — Private Watch Parties

CineRoom is a private online watch-party web application designed for a maximum of 6 people to watch videos together in synchronized real-time.

This repository contains the **PHASE 1 FOUNDATION** setup.

## Key Architecture

### 1. Hybrid Serverless + P2P Mesh
- **Control plane**: Relies on a serverless database (Supabase is recommended for Phase 2) using Row Level Security (RLS) to enforce room isolation, password validations, and metadata storage.
- **Data plane**: Employs a full-mesh WebRTC network between the 2-6 participants for low-latency voice media and future local video chunked transport.

### 2. State & Service Separation
- **State Management**: Zustand handles single-source-of-truth states (playback, participants, chat, queue, diagnostic logs).
- **Service Interfaces**: Real-time updates and WebRTC controls are abstracted into separate service modules (`RealtimeService` and `WebRTCService`), keeping side effects isolated from React components.
- **Diagnostics Logger**: A custom in-memory diagnostic utility feeds a real-time developer console visible in the Room UI for testing signaling messages.

---

## Folder Structure

```
cineroom/
├── .env.example       # Environmental template
├── .env.local         # Local developer environment variables
├── package.json       # App scripts and dependencies
├── tsconfig.json      # TypeScript specifications
├── vite.config.ts     # Vite bundler parameters
├── tailwind.config.js # Custom utility-first glassmorphic styling
├── index.html         # Document index wrapper
└── src/
    ├── main.tsx       # Root entrypoint
    ├── App.tsx        # Router provider mount
    ├── index.css      # CSS variables for themes & glassmorphism
    ├── components/
    │   └── ui/        # Atomic UI primitives (Button, Input, Card, Modal, Badge)
    ├── pages/         # Page templates (Landing, CreateRoom, JoinRoom, Room, NotFound)
    ├── router/        # React Router browser client configurations
    ├── services/      # Abstraction interfaces and mock managers
    │   ├── diagnostics/
    │   ├── realtime/
    │   └── webrtc/
    └── store/         # Zustand store for room synchronization
```

---

## Getting Started

### 1. Install Dependencies
```bash
# Since execution policies on PowerShell might block standard wrapper scripts, run:
npm.cmd install
```

### 2. Run Development Server
```bash
# Starts Vite local dev server on http://localhost:3000
npm.cmd run dev
```

### 3. Build & Compile Checks
```bash
# Executes tsc and builds optimized bundle inside /dist
npm.cmd run build
```

---

## Environmental Configuration

Inside `.env.local`, you can control mock systems:
- `VITE_USE_MOCK_SERVICES`: Toggle to `true` (default) to simulate all signaling, database rules, automatic peer joins, and ping drifts in-memory without a live database. Set to `false` when connecting to production databases.
- `VITE_ICE_SERVERS`: Define a JSON array of STUN/TURN servers used by WebRTC.
