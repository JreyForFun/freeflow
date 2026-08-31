# FREEFLOW — PROJECT CONTEXT
> **READ THIS FIRST before touching any code in this project.**
> This is the single source of truth for every decision, design detail, and technical constraint for the Freeflow app.
> Last updated: 2026-08-06

---

## 1. WHAT IS FREEFLOW?

A **personal daily scheduler** mobile app for Android. It is inspired by the Anthropic Claude branding aesthetic — warm, humanist, minimal. The user can schedule their day visually on a 24-hour timeline, import events from Google Calendar via `.ics` file, get AI-powered insights about their workload, and chat with a tiny offline AI assistant.

**No login. No backend. No cloud sync. 100% local.**

---

## 2. WHERE THE UI CAME FROM

The UI was designed in **Google Stitch** first. All screens exist as HTML prototypes at:

```
c:\Users\ADMIN\freeflow\stitch_freeflow_ai_scheduler\stitch_freeflow_ai_scheduler\
├── DESIGN.md                        ← Full design system (colors, typography, spacing, components)
├── schedule_updated\
│   ├── code.html                    ← Schedule screen prototype
│   └── screen.png                   ← Screenshot of Schedule screen
├── hub_updated\
│   ├── code.html                    ← Hub screen prototype
│   └── screen.png                   ← Screenshot of Hub screen
├── ai_assistant_updated\
│   ├── code.html                    ← AI & Insights screen prototype
│   └── screen.png                   ← Screenshot of AI screen
└── settings_updated\
    ├── code.html                    ← Settings screen prototype
    └── screen.png                   ← Screenshot of Settings screen
```

**These HTML prototypes are the visual reference. When in doubt, look at the screen.png files.**

---

## 3. TECH STACK (FINAL, NON-NEGOTIABLE)

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type safety |
| Framework | **Expo** (Dev Build via EAS) | Required for native modules |
| Navigation | **Expo Router** (file-based) | Tab layout, deep linking ready |
| Architecture | **New Architecture** (newArchEnabled: true) | Required by llama.rn |
| Database | **expo-sqlite** | Local, offline-first, no cloud |
| Offline AI (chat) | **llama.rn** + SmolLM2 360M Q4_K_M GGUF | ~200MB, on-device, no internet |
| ICS Import | **expo-document-picker** + **expo-file-system** + **cal-parser** | No OAuth needed |
| Drag and Drop | **react-native-reanimated** + **react-native-gesture-handler** | Full gesture-based D&D |
| Fonts | **expo-font** (Source Serif 4 + Inter, self-hosted in assets/) | Matches design system exactly |
| Icons | **@expo/vector-icons** MaterialCommunityIcons | Closest to Material Symbols used in prototype |
| Build target | **Android first** | User has no iOS device |

> **IMPORTANT:** This app requires an **EAS Dev Build** — it will NOT run in Expo Go because llama.rn and gesture handler need native code compiled in.

---

## 4. WHAT IS NOT IN THIS APP (EVER)

- NO User login / sign-up / auth
- NO Backend server / API
- NO Cloud storage
- NO Google OAuth (we use .ics file import instead)
- NO Push notifications (toggle in Settings is a placeholder)
- NO iOS (Android only for now)

---

## 5. DESIGN SYSTEM (FROM DESIGN.md)

### Brand Philosophy
"Humanist Minimalist" — warm, editorial, paper-like. Like Anthropic Claude. NOT cold tech-blue.
- Generous whitespace, no heavy gradients, no aggressive shadows
- Depth via **tonal layering** and **1px borders**, not drop shadows
- Backdrop blur (8px) + 5% charcoal tint for overlays/modals

### Color Tokens

Primary (Terracotta):         #99462a   on-primary: #ffffff
Primary Container:            #d97757   on-primary-container: #541400
Primary Fixed:                #ffdbd0   Primary Fixed Dim: #ffb59e
Inverse Primary:              #ffb59e

Secondary (Sage):             #4a654d   on-secondary: #ffffff
Secondary Container:          #cae8c9   on-secondary-container: #4f6951
Secondary Fixed:              #cceacc   Secondary Fixed Dim: #b1ceb1

Tertiary:                     #5e5e5b   on-tertiary: #ffffff
Tertiary Container:           #93928e   on-tertiary-container: #2b2b28
Tertiary Fixed:               #e4e2dd   Tertiary Fixed Dim: #c8c6c2

Background (Cream):           #fcf9f8   on-background: #1c1b1b
Surface:                      #fcf9f8   on-surface: #1c1b1b
Surface Bright:               #fcf9f8
Surface Dim:                  #dcd9d9
Surface Container Lowest:     #ffffff
Surface Container Low:        #f6f3f2
Surface Container:            #f0eded
Surface Container High:       #eae7e7
Surface Container Highest:    #e5e2e1
Surface Variant:              #e5e2e1   on-surface-variant: #55433d

Outline:                      #88726c
Outline Variant:              #dbc1b9
Surface Tint:                 #99462a

Inverse Surface:              #313030   inverse-on-surface: #f3f0ef

Error:                        #ba1a1a   on-error: #ffffff
Error Container:              #ffdad6   on-error-container: #93000a

### Typography

display        → Source Serif 4 | 48px | weight 600 | lineHeight 1.1 | tracking -0.02em
headline-lg    → Source Serif 4 | 32px | weight 600 | lineHeight 1.2
headline-lg-mobile → Source Serif 4 | 28px | weight 600 | lineHeight 1.2
headline-md    → Source Serif 4 | 24px | weight 500 | lineHeight 1.3
body-lg        → Inter | 18px | weight 400 | lineHeight 1.6
body-md        → Inter | 16px | weight 400 | lineHeight 1.6
label-md       → Inter | 14px | weight 500 | lineHeight 1.4 | tracking 0.01em
label-sm       → Inter | 12px | weight 600 | lineHeight 1.2 | tracking 0.05em

### Spacing (ALL multiples of 4px)

xs=4px  sm=8px  md=16px  lg=24px  xl=48px  xxl=80px  gutter=24px  margin-mobile=16px

### Border Radius

sm=4px  DEFAULT=8px  md=12px  lg=16px  xl=24px  full=9999px

### Component Rules
- Buttons: Primary=terracotta bg+white text. Secondary=border+charcoal text. Hover=2px up (NO shadows).
- Inputs: surface-container bg, no border. Focused=1px terracotta border.
- Cards: FLAT with 1px outline-variant border. NO floating shadows.
- Chips/Badges: Sage at 10% opacity bg, full Sage text.
- Modals/Overlays: backdrop-filter blur(8px) + background rgba(28,27,27,0.05)
- Icons: thin-stroke, filled variant for active states only.

---

## 6. SCREENS — DETAILED SPEC

### SCREEN 1: SCHEDULE (Tab icon: calendar_today) — THE MAIN SCREEN

#### Layout
- Full 24-hour scrollable timeline (like Google Calendar)
- HOUR_HEIGHT = 64px, total scroll height = 1536px (24 * 64)
- Left column: hour labels 00:00 → 23:00 (label-sm, muted)
- Events positioned absolutely at correct time slots

#### Event Positioning Math
  top = (startHour * 64) + (startMinute / 60 * 64)
  height = (durationMinutes / 60) * 64

#### Auto-Scroll (CRITICAL BEHAVIOR)
- On mount: scrollTo y=(currentHour-1)*64 + (currentMinute/60*64), animated:true
- On AppState change to 'active': re-scroll to current time
- Every time app opens or comes to foreground → lands at NOW

#### Current Time Line
- Terracotta #99462a horizontal line at current time position
- Updates every 60 seconds
- Shows "HH:MM" label in label-sm terracotta to the left

#### Event Card States
- Past: opacity 60%, strikethrough title
- Active (now): terracotta 4px left border, surface-container bg, tasks badge
- Upcoming: flat, outline-variant border, hover darkens bg slightly

#### Drag and Drop
- Long-press to initiate drag (prevents accidental drags)
- Snap to nearest 15-minute slot
- newStartMinutes = Math.round(dropY / (64/4)) * 15
- newStartTime = HH:MM string from newStartMinutes
- Update event in SQLite immediately on release

#### Event Modal (tap to open)
- Bottom sheet with blur overlay
- Shows: time range, category pill, title (Source Serif 4 headline-md)
- Task checklist: checkbox rows, toggle completed in SQLite
- "Add task" button at bottom
- Buttons: "Reschedule" (secondary) + "Done" (primary terracotta)
- Animation: scale 0.95→1.0, opacity 0→1, 200ms

#### Quick-Add Input
- Pinned above tab bar, pill shape, surface-container bg
- Plus icon on left, placeholder "Type to add to schedule..."
- On submit: parse time from text or open time picker

---

### SCREEN 2: HUB (Tab icon: grid_view)

#### Import Section
- Title: "Import" / subtitle: "Connect external sources to orchestrate your schedule."
- Card with ".ics" button (terracotta, pill)
- On tap: DocumentPicker (type: text/calendar) → FileSystem.readAsStringAsync → cal-parser → SQLite insert
- source='imported', category='imported', completed=0
- Duplicate check: skip if title+date+start_time already exists
- Show toast: "Imported X events"

#### Templates Section
- Title: "Templates" / subtitle: "Architectural foundations for your days."
- 3 cards in a grid:

  Deep Work Day (psychology icon, sage bg):
    08:00 Morning Prep 30m
    09:00 Deep Work Block 1 2h
    11:00 Break 15m
    11:15 Deep Work Block 2 2h
    13:00 Lunch 1h
    14:00 Deep Work Block 3 2h
    16:00 Review 30m

  Meeting Heavy (groups icon, tertiary bg):
    09:00 Standup 30m
    09:30 Buffer 15m
    10:00 Meeting 1 1h
    11:00 Buffer 15m
    11:15 Meeting 2 1h
    12:00 Lunch 1h
    13:00 Meeting 3 1h
    14:00 Buffer 15m

  Relaxed Weekend (weekend icon, primary-container bg):
    09:00 Morning Ease 1h
    10:00 Personal Project 2h
    12:00 Lunch and Walk 1h
    13:00 Rest/Read 2h
    15:00 Social/Errands 2h
    17:00 Wind Down 1h

#### Manual Entry Section
- Dashed border card, "+" icon, "Create Custom Source"
- "Add Event" button → form sheet (title, date, start time, end time, category)

---

### SCREEN 3: AI AND INSIGHTS (Tab icon: auto_awesome)

#### Workload Heatmap
- 10-week grid (70 days), each cell = 14x14px, 4px rounded, 4px gap
- Columns=weeks, rows=Mon-Sun
- Colors by event count: 0=surface-container-highest, 1-2=primary-container/20%, 3-4=primary-container/40%, 5+=primary-container
- Month labels above, "10 weeks ago"/"Today" below, Less/More legend

#### Streak Card
- Consecutive days with >=1 completed event
- Large terracotta number + "DAY STREAK" uppercase label
- Faint fire icon (local_fire_department, 10% opacity) in top-right bg

#### Burnout Risk Card
- Computed from avg daily scheduled hours past 7 days:
  avg > 8h/day = High (error red)
  6-8h/day = Medium (tertiary)
  avg < 6h/day = Low (secondary/sage)
- energy_savings_leaf icon in sage color

#### AI Chat FAB + Sheet
- Terracotta FAB, auto_awesome filled icon, bottom-right above tab bar
- First time: shows model download banner (SmolLM2 ~200MB, progress bar)
- After model: chat UI with streaming responses
- System prompt: today's date + all today's events with status
- User bubbles: terracotta bg. AI bubbles: surface-container bg.

---

### SCREEN 4: SETTINGS (Tab icon: settings)

- "Settings" title, "Manage your preferences." subtitle
- List with 1px dividers:
  1. Notifications → chevron (placeholder)
  2. App Theme → shows current (System/Light/Dark), expand_more dropdown
  3. Privacy Policy → chevron → open URL
  4. Help Center → chevron → open URL
  5. Buy me a coffee → chevron, sage tint bg, coffee icon (primary filled) → open URL

---

## 7. TAB BAR

- Floating pill, fixed bottom
- bg: surface-container-lowest at 90-95% opacity + backdrop-blur-md
- border: 1px outline-variant
- shape: fully rounded (rounded-full)
- Active tab: terracotta icon+text, secondary-container/30% pill bg
- Inactive tab: on-surface-variant icon+text
- Icons: calendar_today, grid_view, auto_awesome, settings
- Active icon: FILL=1 (filled). Inactive: FILL=0 (outlined).

---

## 8. DATABASE SCHEMA

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,            -- YYYY-MM-DD
  start_time TEXT NOT NULL,      -- HH:MM (24hr)
  end_time TEXT,                 -- HH:MM (nullable)
  description TEXT,
  category TEXT DEFAULT 'personal',  -- focus | meeting | personal | imported
  completed INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',  -- manual | imported | template
  created_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

Default settings rows:
  ('theme', 'system')
  ('notifications_enabled', 'true')
  ('ai_model_downloaded', 'false')
  ('ai_model_path', '')

---

## 9. FILE STRUCTURE

c:\Users\ADMIN\freeflow\
├── PROJECT_CONTEXT.md         ← THIS FILE
├── app.json
├── package.json
├── tsconfig.json
├── app/
│   ├── _layout.tsx            ← Root: fonts, DB init, theme provider
│   └── (tabs)/
│       ├── _layout.tsx        ← Tab bar (custom floating pill)
│       ├── index.tsx          ← Schedule screen
│       ├── hub.tsx            ← Hub screen
│       ├── ai.tsx             ← AI & Insights screen
│       └── settings.tsx       ← Settings screen
├── components/
│   ├── schedule/
│   │   ├── TimelineGrid.tsx
│   │   ├── EventBlock.tsx
│   │   ├── DraggableEventBlock.tsx
│   │   ├── CurrentTimeLine.tsx
│   │   └── EventModal.tsx
│   ├── hub/
│   │   ├── ICSImportCard.tsx
│   │   ├── TemplateCard.tsx
│   │   └── AddEventSheet.tsx
│   ├── ai/
│   │   ├── WorkloadHeatmap.tsx
│   │   ├── StreakCard.tsx
│   │   ├── BurnoutRiskCard.tsx
│   │   ├── AIChatSheet.tsx
│   │   └── ModelDownloadBanner.tsx
│   ├── settings/
│   │   └── SettingsRow.tsx
│   └── ui/
│       ├── Typography.tsx
│       ├── Card.tsx
│       ├── BottomSheet.tsx
│       └── TabBar.tsx
├── db/
│   ├── client.ts
│   ├── schema.ts
│   ├── events.ts
│   └── tasks.ts
├── hooks/
│   ├── useEvents.ts
│   ├── useTasks.ts
│   ├── useStreak.ts
│   ├── useBurnoutRisk.ts
│   ├── useHeatmap.ts
│   └── useLlama.ts
├── services/
│   ├── icsImport.ts
│   └── llamaService.ts
├── theme/
│   └── tokens.ts
└── assets/fonts/
    ├── SourceSerif4-Regular.ttf
    ├── SourceSerif4-SemiBold.ttf
    ├── Inter-Regular.ttf
    ├── Inter-Medium.ttf
    └── Inter-SemiBold.ttf

---

## 10. OFFLINE AI DETAILS

Model: SmolLM2 360M Q4_K_M (HuggingFaceTB/SmolLM2-360M-Instruct-GGUF)
File: smollm2-360m-instruct-q4_k_m.gguf (~200MB)
Stored at: FileSystem.documentDirectory + 'models/smollm2.gguf'

Used ONLY for: "Ask AI" chat in AI & Insights screen
Pure JS (no model): heatmap, streak, burnout risk

System prompt format:
  "You are a focused, calm scheduling assistant. Today is {dayName}, {date}.
  Here is the user's schedule for today:
  - 09:00: Morning Review (done)
  - 10:30: Deep Work (pending, 2 tasks)
  Answer briefly and helpfully."

Max context: 2048 tokens

---

## 11. ICS IMPORT FLOW

1. DocumentPicker.getDocumentAsync({ type: 'text/calendar' })
2. FileSystem.readAsStringAsync(uri)
3. cal-parser.parseString(content) → events array
4. Map: dtstart→start_time, dtend→end_time, summary→title, description→description
5. Insert to events table: source='imported', category='imported', completed=0
6. Skip if title+date+start_time already exists (dedup)
7. Toast: "Imported X events"

How user exports from Google Calendar:
Settings → Import & Export → Export → download ZIP → unzip → .ics file → transfer to phone

---

## 12. DRAG AND DROP

- Long-press to start (not instant, prevents scroll conflicts)
- Scale 1.05 while dragging
- Snap to 15-minute grid: newStartMinutes = Math.round(dropY / 16) * 15
- newStartTime = HH:MM padded string
- Update SQLite on release

---

## 13. BUILD COMMANDS

cd c:\Users\ADMIN\freeflow
npm install
npx expo start --dev-client        # needs EAS dev build APK on device
eas build --profile development --platform android
eas build --profile production --platform android

app.json must have:
  "newArchEnabled": true
  android.package: "com.freeflow.scheduler"

---

## 14. DELIVERY PHASES

Phase 1 (Foundation):
  - Expo project + New Architecture
  - theme/tokens.ts
  - SQLite schema + CRUD
  - Custom floating tab bar
  - Schedule screen: 24hr timeline, auto-scroll, seed data
  - EventModal: task checklist

Phase 2 (Full Interaction):
  - Drag-and-drop reordering
  - Quick-add input
  - Hub: ICS import
  - Hub: Templates
  - Hub: Manual entry form

Phase 3 (AI Layer):
  - Heatmap, streak, burnout (pure JS)
  - llama.rn + SmolLM2 download flow
  - AI chat with streaming

Phase 4 (Polish):
  - Dark mode
  - Micro-animations
  - Production APK build

---

## 15. BUILDING RULES (NEVER BREAK THESE)

1. Never use arbitrary hex colors — always use theme/tokens.ts constants
2. All spacing must be multiples of 4px — use spacing tokens
3. No floating shadows on cards — use 1px outline-variant border
4. Source Serif 4 for ALL headings. Inter for ALL body/label/UI text.
5. Tab bar is ALWAYS visible (fixed bottom). Never cover it.
6. SQLite is the ONLY persistent storage.
7. App MUST work in airplane mode after first AI model download.
8. Event times stored as "HH:MM" strings (24hr). Dates as "YYYY-MM-DD".
9. Event IDs are UUIDs.
10. All modals use backdrop blur (8px + 5% charcoal tint), NOT solid dark overlay.
