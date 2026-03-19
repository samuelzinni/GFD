# GFD Ticketing - Vollständiges Handover-Dokument

## Projekt-Übersicht

**Name:** German Finance Dinner (GFD) Ticketing System
**Typ:** Progressive Web App (PWA) mit QR-Code Check-in
**Stack:** React + Vite + Tailwind CSS (Frontend) | Firebase (Backend)
**Firebase Project ID:** `gfd-ticketing`
**Git-Repo:** `samuelzinni/GFD`
**Aktueller Branch:** `claude/qr-code-pwa-app-TiNPH`
**Status:** Funktionsfähig, deployed via GitHub Actions

---

## Architektur

```
GFD/
├── client/                  # React Frontend (Vite + Tailwind + PWA)
│   ├── src/
│   │   ├── App.jsx          # Router & App-Struktur
│   │   ├── main.jsx         # Entry Point
│   │   ├── index.css        # Tailwind CSS
│   │   ├── lib/
│   │   │   └── firebase.js  # Firebase SDK Init (Auth + Firestore)
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Auth State Management
│   │   ├── components/
│   │   │   └── Layout.jsx   # Sidebar + Navigation
│   │   └── pages/
│   │       ├── Login.jsx        # Login-Seite
│   │       ├── Dashboard.jsx    # Übersicht & Statistiken
│   │       ├── Participants.jsx # Teilnehmer-Verwaltung
│   │       ├── Tables.jsx       # Tisch-Verwaltung
│   │       ├── Scanner.jsx      # QR-Code Scanner (Check-in)
│   │       └── Settings.jsx     # Einstellungen
│   ├── public/              # Static Assets (PWA Icons)
│   ├── vite.config.js       # Vite + PWA + Tailwind Config
│   ├── .env                 # Firebase Keys (VITE_FIREBASE_*)
│   └── package.json
├── functions/               # Firebase Cloud Functions (Node.js 20)
│   ├── index.js             # Express App + Auth Middleware
│   └── routes/
│       ├── dashboard.js     # GET /api/dashboard
│       ├── email.js         # E-Mail Versand (Resend API)
│       ├── events.js        # Event CRUD
│       ├── import.js        # CSV/Excel Import
│       ├── participants.js  # Teilnehmer CRUD
│       ├── scan.js          # QR-Code Check-in
│       ├── setup.js         # Initial Setup
│       ├── tables.js        # Tisch-Verwaltung
│       └── tickets.js       # Ticket-Generierung (PDF + QR)
├── firestore.rules          # Firestore Security Rules
├── firestore.indexes.json   # Firestore Indexes
├── firebase.json            # Firebase Config (Hosting + Functions + Firestore)
├── .github/workflows/
│   └── deploy.yml           # Auto-Deploy bei Push auf main oder Feature-Branch
└── package.json             # Root scripts (dev, build, deploy, setup)
```

---

## Firebase-Konfiguration

### Firebase Project
- **Project ID:** `gfd-ticketing`
- **Region:** `europe-west1`
- **Auth:** Email/Password Authentication
- **Database:** Cloud Firestore
- **Hosting:** Firebase Hosting
- **Functions:** Cloud Functions v2 (Node.js 20)

### Client Environment Variables (`client/.env`)
```env
VITE_FIREBASE_API_KEY=AIzaSyB1jwJGX6TtFBwrp4-DDl1LbppV8gCm62I
VITE_FIREBASE_AUTH_DOMAIN=gfd-ticketing.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gfd-ticketing
VITE_FIREBASE_STORAGE_BUCKET=gfd-ticketing.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=263233802074
VITE_FIREBASE_APP_ID=1:263233802074:web:6023312e5d32fdba57ad63
VITE_API_URL=
```

### GitHub Secrets (für CI/CD)
Folgende Secrets müssen im GitHub Repo unter Settings > Secrets gesetzt sein:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `GCP_SA_KEY` (Google Cloud Service Account JSON Key für Deployment)

---

## Lokale Entwicklung starten

### Voraussetzungen
- Node.js 20+
- npm
- Firebase CLI (`npm install -g firebase-tools`)

### Setup
```bash
# 1. In den Projektordner wechseln
cd ~/Downloads/GFD

# 2. Dependencies installieren
npm run setup
# (installiert client/ und functions/ Dependencies)

# 3. Client .env prüfen (sollte bereits vorhanden sein)
cat client/.env

# 4. Dev-Server starten
npm run dev
# → öffnet http://localhost:5173
```

### Firebase CLI Login (falls nötig)
```bash
firebase login
firebase use gfd-ticketing
```

### Deployment
```bash
# Alles deployen (Build + Hosting + Functions + Firestore Rules)
npm run deploy

# Nur Hosting
npm run deploy:hosting

# Nur Functions
npm run deploy:functions

# Nur Firestore Rules
npm run deploy:rules
```

---

## Git-Status

### Branch-Situation
- **Aktiver Branch:** `claude/qr-code-pwa-app-TiNPH`
- **Working Tree:** Clean (keine uncommitteten Änderungen)
- **Remote:** `origin` → `github.com/samuelzinni/GFD`

### Letzte Commits (neueste zuerst)
```
e8577f1 fix(ci): Deploy functions alongside hosting and firestore
2f31a04 refactor(email): Replace nodemailer/SMTP with Resend API
e99af97 feat: Add email system, table management, phone numbers, and UI fixes
5c44e6f feat(ui): Add GFD logo to sidebar and login page
1c19784 Add files via upload
eea2435 fix: Replace all Cloud Function API calls with direct Firestore operations
f068b02 fix(auth): Allow users to create their own user doc on first login
2b868c4 fix(auth): Use direct Firestore for user setup, rename to Ticket System
313920f fix(ci): Deploy only hosting+firestore, skip functions
f90fd91 fix(firestore): Remove single-field index that causes deploy error
```

### Weiterarbeiten mit Git
```bash
cd ~/Downloads/GFD
git status
git pull origin claude/qr-code-pwa-app-TiNPH

# Neue Änderungen committen
git add .
git commit -m "feat: Beschreibung"
git push -u origin claude/qr-code-pwa-app-TiNPH
```

---

## Funktionen der App

### Implementiert
1. **Login-System** - Firebase Auth mit Email/Password
2. **Dashboard** - Übersicht mit Check-in Statistiken
3. **Teilnehmer-Verwaltung** - CRUD, CSV/Excel Import
4. **Tisch-Verwaltung** - Tische erstellen, Teilnehmer zuweisen
5. **QR-Code Scanner** - Kamera-basierter Check-in via html5-qrcode
6. **Ticket-Generierung** - PDF mit QR-Code (via Cloud Functions)
7. **E-Mail-System** - Tickets per E-Mail versenden (Resend API)
8. **PWA** - Installierbar, Offline-fähig, Portrait-Modus
9. **CI/CD** - Automatisches Deployment via GitHub Actions
10. **GFD Branding** - Logo in Sidebar und Login

### Firestore Collections
- `events` - Events/Veranstaltungen
- `participants` - Teilnehmer (Name, Email, Telefon, Ticket-Status)
- `tables` - Tische
- `seats` - Sitzplätze
- `checkInLog` - Check-in Protokoll
- `users` - App-Benutzer (Admin/Scanner Rollen)
- `config` - App-Konfiguration

### User Rollen
- **admin** - Vollzugriff (Teilnehmer, Tische, Events, Settings)
- **scanner** - Nur QR-Code Scanner und Dashboard

---

## Technologie-Details

| Komponente | Technologie | Version |
|---|---|---|
| Frontend | React | 19.x |
| Bundler | Vite | 8.x |
| CSS | Tailwind CSS | 4.x |
| Icons | Lucide React | 0.577.x |
| QR Scanner | html5-qrcode | 2.3.x |
| PWA | vite-plugin-pwa | 1.2.x |
| Backend | Firebase Functions v2 | Node.js 20 |
| Database | Cloud Firestore | - |
| Auth | Firebase Auth | - |
| PDF | PDFKit | 0.15.x |
| QR Generation | qrcode | 1.5.x |
| Email | Resend | 4.x |
| Import | xlsx + csv-parse | - |
| CI/CD | GitHub Actions | - |

---

## Bekannte Hinweise

1. **Cloud Functions Billing** - Firebase Functions v2 benötigt ein Blaze-Plan (Pay-as-you-go). Der CI/CD Workflow deployed Functions mit.
2. **Resend API Key** - Für den E-Mail-Versand wird ein Resend API Key benötigt. Dieser muss als Firebase Function Config oder Environment Variable gesetzt werden.
3. **PWA Icons** - Die PWA benötigt `logo-192.png` und `logo-512.png` in `client/public/`.
4. **Proxy im Dev-Modus** - Vite proxied `/api` Requests an `localhost:3001`. Für lokale Funktions-Entwicklung: `firebase emulators:start`.

---

## Prompt für den neuen Chat

Kopiere folgenden Text in den neuen Claude-Chat:

```
Ich arbeite an einem GFD (German Finance Dinner) Ticketing System.
Das Projekt liegt unter ~/Downloads/GFD.

Bitte lies zuerst die Datei ~/Downloads/GFD/HANDOVER.md für den
vollständigen Projektkontext (Architektur, Firebase-Config, Git-Status,
implementierte Features, Tech-Stack).

Der aktive Git-Branch ist: claude/qr-code-pwa-app-TiNPH
Das Firebase Project ist: gfd-ticketing

Stack: React 19 + Vite 8 + Tailwind 4 (Frontend) | Firebase Functions v2 +
Firestore (Backend) | PWA mit QR-Code Check-in

Ich möchte jetzt weiterarbeiten an: [HIER DEINE AUFGABE BESCHREIBEN]
```

---

*Erstellt am 19.03.2026 | Letzter Commit: e8577f1*
