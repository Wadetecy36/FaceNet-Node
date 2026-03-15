# FACENET · NODE

> Decentralised edge biometric attendance and surveillance system powered by face recognition AI, built for the **ACity Tech Expo 2026**.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)

---

## Overview

FaceNet-Node is a real-time biometric identification system that uses client-side face recognition to match faces against an enrolled identity vault. It runs entirely in the browser — no cloud API, no external processing.

The system is one half of the **SENTINEL** platform. The other half is [GreenWatch](../FaceNet/README.md), an environmental AI surveillance system for detecting illegal artisanal gold mining (Galamsey).

---

## Features

- **Live biometric scan** — real-time face detection and matching via webcam with HUD overlays
- **Identity enrollment** — capture face descriptors and store encrypted profiles
- **ID Vault** — browse and manage all enrolled identities with thumbnails
- **Access log** — searchable, date-filterable attendance records
- **GreenWatch integration** — embedded SENTINEL dashboard with live WebSocket feed from the YOLO inference server
- **Dark navy UI** — purpose-built tactical interface with cyan accent theme

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + custom CSS variables |
| Face AI | `@vladmandic/face-api` (SSD MobileNet V1) |
| Animation | Framer Motion |
| Backend API | Node.js + Express (TypeScript) |
| Database | PostgreSQL via `pg` |
| Deployment | Vercel (frontend) |

---

## Project Structure

```
FaceNet-Node/
├── src/
│   ├── App.tsx               # Main React app — all 5 tabs
│   ├── index.css             # Design system (navy/cyan theme)
│   ├── main.tsx              # Vite entry point
│   └── lib/
│       ├── face-service.ts   # Face detection + matching wrapper
│       └── utils.ts          # cn() and helpers
├── public/
│   ├── favicon.svg           # Hex logo favicon (cyan)
│   └── models/               # Face-API model weights
│       ├── ssd_mobilenetv1_model-*
│       ├── face_landmark_68_model-*
│       └── face_recognition_model-*
├── index.html                # Vite HTML entry
├── server.ts                 # Express API server
├── package.json
└── tsconfig.json
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL (local or hosted)
- Face-API model weights in `public/models/`

---

## Setup

### 1. Install dependencies

```bash
cd F:\FaceNet-Node
npm install
```

### 2. Configure environment

Create `.env` in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/facenet
PORT=3001
```

### 3. Download face-api models

Place the following model files inside `public/models/`:

- `ssd_mobilenetv1_model-weights_manifest.json` + shard files
- `face_landmark_68_model-weights_manifest.json` + shard files
- `face_recognition_model-weights_manifest.json` + shard files

They can be downloaded from the [@vladmandic/face-api GitHub releases](https://github.com/vladmandic/face-api).

### 4. Start the API server

```bash
npm run server
# Starts Express on http://localhost:3001
```

### 5. Start the React dev server

```bash
npm run dev
# Opens http://localhost:5173
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List all enrolled users |
| `POST` | `/api/register` | Enroll a new identity |
| `GET` | `/api/attendance` | Query access logs (supports `?search=` and `?date=`) |
| `POST` | `/api/attendance` | Log an access event |

---

## UI Tabs

| Tab | Description |
|-----|-------------|
| **Biometric Scan** | Live webcam feed with real-time face detection, matched identity overlays, and HUD |
| **Enroll** | Capture face descriptor from camera and register to the vault |
| **ID Vault** | Card grid of all enrolled profiles with photo thumbnails |
| **Access Log** | Filterable table of all authentication events |
| **GreenWatch** | Embedded SENTINEL dashboard + live anomaly feed from `ws://localhost:8000/ws` |

---

## Running with the Full Stack

For the complete SENTINEL platform, use the launcher in the GreenWatch project:

```powershell
# From F:\FaceNet
powershell -ExecutionPolicy Bypass -File .\start_ps.ps1
```

This starts all services in the correct order — Flask logger → YOLO server → Node API → React UI → Live capture.

---

## Deployment

The React frontend is deployed to Vercel at:  
**https://face-net-node-19us.vercel.app/**

The Node API (`server.ts`) and face recognition run locally — the Vercel deployment is for demo/preview purposes only.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `PORT` | Express server port | `3001` |

---

## Connected Services

| Service | Port | Purpose |
|---------|------|---------|
| Node API | `3001` | User registration and attendance logs |
| YOLO Inference | `8000` | GreenWatch AI inference + WebSocket |
| Flask Logger | `5000` | SQLite anomaly persistence |

---

## License

MIT — Academic City University, Ghana · ACity Tech Expo 2026
