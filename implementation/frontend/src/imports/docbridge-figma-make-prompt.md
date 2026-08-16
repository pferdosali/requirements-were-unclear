# DocBridge — Figma Make Prompt (Complete Frontend)

## Project Overview

Build a complete, production-ready frontend for **DocBridge** — a document upload orchestration platform for clinical trial coordinators. The app allows users to upload files, select destinations, submit batch upload jobs, track real-time progress, and retry failed uploads.

**Tech Stack:** React 18+ · TypeScript · Vite · Tailwind CSS · Radix UI · shadcn/ui components  
**Design System:** shadcn/ui (default theme with neutral palette, supports dark mode toggle)  
**Layout:** Responsive SPA — optimized for desktop (1440px primary), functional down to tablet (768px)  
**Typography:** Inter (body), JetBrains Mono (monospace/status codes)

---

## Global Layout & Navigation

### App Shell
- **Top navigation bar** (sticky, h-16):
  - Left: DocBridge logo + wordmark
  - Center: Navigation tabs — "Upload", "Jobs", "Destinations" (highlight active)
  - Right: Region badge (colored pill — see Region Badge below), User avatar dropdown (name, team, role, quick persona switcher [dev only], settings link, sign out)
- **Main content area** below nav (max-w-7xl, centered, px-6)
- **Toast notification area** — bottom-right stack (for success/error/info)
- **WebSocket connection indicator** — subtle dot in top-right (green = connected, yellow = reconnecting, red = disconnected)

### Color Semantics
| State | Color | Usage |
|-------|-------|-------|
| Success | green-500 | Completed tasks/jobs |
| Warning | amber-500 | Partial success, retrying |
| Error | red-500 | Failed tasks/jobs |
| Info | blue-500 | Processing, pending |
| Neutral | slate-400 | Inactive, metadata |

---

## Page 1: Upload Workspace (`/upload`)

This is the primary workflow page where users upload files and submit jobs.

### Section 1: File Drop Zone (top half)
- Large dashed-border drop area (min-h-[300px])
- Icon: cloud-upload (centered)
- Primary text: "Drag and drop files here"
- Secondary text: "or click to browse" (triggers file picker)
- Accepts: any file type (no restriction in P0)
- Max individual file: 100MB (show error toast if exceeded)
- On drop/select, files appear in the file list below

### Section 2: File List (below drop zone)
- Table/list of selected files with columns:
  - ☐ Checkbox (for bulk actions)
  - File name (truncate long names, tooltip on hover)
  - Size (human-readable: KB/MB)
  - Type (MIME or extension)
  - Status icon: ✓ ready / ⚠ error
  - Remove button (trash icon)
- Header row with "Select All" checkbox
- Footer: "{n} files selected · {total size}" + "Clear All" link
- Empty state: "No files selected. Drag files above or browse."

### Section 3: Destination Selector (sidebar or collapsible panel)
- Tree browser structure:
  ```
  Region (auto-selected based on user's team)
  └── Team
      └── Binder
          └── Folder (selectable leaf)
  ```
- Expandable/collapsible nodes with chevron icons
- Search/filter input at top of tree
- Selected destination shown as breadcrumb: "US-East → Team Alpha → Regulatory → Q3 Reports"
- Only one destination selectable per job (P0)
- If no destination selected: show inline validation "Please select a destination"

### Section 4: Submit Bar (sticky bottom or fixed footer)
- Left: Summary text — "{n} files → {destination name}"
- Right: "Submit Upload Job" button (primary, large)
- Button states:
  - Disabled: no files OR no destination selected
  - Loading: spinner + "Submitting..." (during API call)
  - Success: briefly shows "Submitted ✓" then redirects to Job Detail page
- On submit, calls the API sequence:
  1. `POST /api/upload/presign` (per file)
  2. `PUT` to S3 presigned URL (with progress %)
  3. `POST /api/upload/confirm` (per file)
  4. `POST /api/jobs` (create job with tasks)
  5. `POST /api/jobs/:jobId/submit` (triggers processing)

### Upload Progress Modal/Overlay
- When submitting, show a progress overlay:
  - Overall progress bar (% of files uploaded to S3)
  - Per-file progress rows: filename, progress bar, speed, ETA
  - Cancel button (stops remaining uploads, does not cancel submitted)
  - On completion: "All files uploaded. Job submitted." → auto-navigate to job detail

---

## Page 2: Jobs Dashboard (`/jobs`)

Shows all jobs for the authenticated user.

### Filters & Controls (top bar)
- Filter tabs: "All" | "Active" | "Completed" | "Failed"
- Sort dropdown: "Newest first" (default) | "Oldest first"
- Refresh button (manual, in addition to WebSocket auto-updates)
- Search input: filter by job ID or file names

### Job List (cards or table rows)
Each job displays:
- **Job ID** (monospace, truncated UUID with copy button)
- **Status badge**: Pending (blue) | Processing (blue/animated) | Completed (green) | Partial Success (amber) | Failed (red)
- **Progress bar** (% of tasks completed out of total)
- **Task summary**: "12/15 tasks completed · 2 failed · 1 processing"
- **Created**: relative time ("2 min ago") with absolute tooltip
- **Destination**: breadcrumb path
- **Action**: "View Details →" link

### Empty States
- No jobs at all: illustration + "No upload jobs yet. Start by uploading files." + CTA button to `/upload`
- No matching filter: "No {filter} jobs found."

### Real-Time Updates
- WebSocket pushes update individual job cards without full page reload
- Subtle pulse animation on status change
- New jobs appear at top of list with slide-in animation

---

## Page 3: Job Detail (`/jobs/:jobId`)

Detailed view of a single job with all its tasks.

### Job Header
- Back link: "← All Jobs"
- Job ID (full UUID, monospace, copy button)
- Status badge (large)
- Overall progress bar
- Created / Updated timestamps
- Destination path (breadcrumb)

### Task Table
| Column | Description |
|--------|-------------|
| Task ID | Truncated UUID (tooltip full) |
| File Name | Original filename |
| File Size | Human readable |
| Status | Badge: pending/processing/completed/failed |
| Retry Count | "0/3", "1/3", etc. |
| Error | Error message (if failed, expandable) |
| Actions | Retry button (only on failed tasks) |

### Task Actions
- **Retry button** (on failed tasks): Calls API to resubmit individual task
  - Confirm dialog: "Retry this task? It will be requeued for processing."
  - Button shows loading state during API call
- **Retry All Failed** button (top of table): bulk retry all failed tasks in this job

### Job Summary Footer
- Stats row: Total tasks | Completed | Failed | Processing | Pending
- Time stats: Total duration | Average task duration

### Real-Time Updates
- Task statuses update live via WebSocket
- Processing tasks show animated spinner
- Status transitions have brief highlight animation (flash row green/red)

---

## Page 4: Destinations Browser (`/destinations`)

Browse the destination tree for reference (read-only view, destination selection happens on Upload page). Destinations are filtered by the current user's team/region.

### Region Header
- Top of page: current region banner matching nav badge style
  - "Showing destinations for: 🟢 US-East (Team Alpha)" 
  - Subtext: "Switch persona to view other regions"

### Tree View
- Hierarchical tree filtered by user's region:
  ```
  US-East (if user is Team Alpha):
  └── Team Alpha
      ├── Regulatory
      │   ├── FDA Submissions
      │   └── IRB Approvals
      └── Clinical
          ├── Patient Consent Forms
          └── Adverse Event Reports

  EU-West (if user is Team Beta):
  └── Team Beta
      ├── EMA Submissions
      │   ├── Clinical Trial Applications
      │   └── Safety Reports
      └── Site Documents
          └── Ethics Committee

  AP-Southeast (if user is Team Gamma):
  └── Team Gamma
      ├── TGA Regulatory
      │   ├── CTN Applications
      │   └── Safety Notifications
      └── Site Files
          └── Investigator Brochures
  ```
- Expandable/collapsible nodes with chevron icons
- Show item counts at each level: "2 binders", "4 folders"
- Expand/collapse all button
- Search/filter input at top

### Detail Panel (right side, on click)
- Shows metadata for selected node:
  - Name, Full path, Region, Type (team / binder / folder)
  - Number of child items
  - Destination ID (monospace, for debugging)
  - Recent jobs targeting this destination (last 5)

---

## Page 5: User Settings / Dev Panel (`/settings`) — Dev Only

This page is for development/testing and won't ship to production.

### Persona Switcher (Card Layout)

Display all available personas as selectable cards in a grid (2 columns on desktop, 1 on tablet):

| Persona | Details |
|---------|---------|
| **Alice Chen** | user-1 · Team Alpha · US-East · Coordinator |
| **Bob Mueller** | user-2 · Team Beta · EU-West · Coordinator |
| **Carol Tanaka** | user-3 · Team Alpha · US-East · Reviewer |
| **David Okafor** | user-4 · Team Gamma · AP-Southeast · Coordinator |
| **Emma Johansson** | user-5 · Team Beta · EU-West · Admin |

Each persona card shows:
- Left: Avatar circle with initials (e.g., "AC" for Alice Chen), colored by region
  - US-East avatars: green ring
  - EU-West avatars: blue ring
  - AP-Southeast avatars: orange ring
- Center: Name (bold), email (muted), team name, role badge (small pill: "coordinator" / "reviewer" / "admin")
- Right: Radio indicator (filled = active persona)
- Bottom of card: Region tag pill (e.g., "🟢 US-East" / "🔵 EU-West" / "🟠 AP-Southeast")
- Active card has highlighted border (primary color) + subtle background tint
- Click any card → switches persona immediately

#### On Persona Switch Behavior:
1. Active card highlight moves to selected persona
2. Nav bar avatar + name updates
3. Region badge in nav updates
4. Toast appears: "Switched to Bob Mueller (Team Beta · EU-West)"
5. All page data refreshes (jobs list clears and reloads, destination tree changes)
6. Persists selection in localStorage (survives page refresh)

### Quick Persona Switcher (Nav Bar Dropdown)

In addition to the full settings page, provide a **quick switcher** in the top nav:
- Click user avatar in top-right → dropdown menu:
  ```
  ┌────────────────────────────────┐
  │  Alice Chen                    │
  │  Team Alpha · US-East          │
  ├────────────────────────────────┤
  │  Switch Persona                │
  │  ┌──────────────────────────┐  │
  │  │ ● Alice Chen (US-East)   │  │
  │  │ ○ Bob Mueller (EU-West)  │  │
  │  │ ○ Carol Tanaka (US-East) │  │
  │  │ ○ David Okafor (AP-SE)   │  │
  │  │ ○ Emma Johansson (EU-W)  │  │
  │  └──────────────────────────┘  │
  ├────────────────────────────────┤
  │  Settings                      │
  │  Sign Out                      │
  └────────────────────────────────┘
  ```
- Selecting a persona from the dropdown triggers same switch behavior as the full page

### Region Badge (Nav Bar — Always Visible)

A persistent badge in the top navigation bar (to the left of the user avatar):
- Shape: Rounded pill / badge
- Content: Colored dot + region short name
- Variants by region:
  - `🟢 US-East` — green-500 dot, green-50 background, green-700 text
  - `🔵 EU-West` — blue-500 dot, blue-50 background, blue-700 text
  - `🟠 AP-Southeast` — orange-500 dot, orange-50 background, orange-700 text
- On hover: tooltip → "Region: United States (East) — determined by your team assignment"
- On click: navigates to `/settings` (persona switcher page)
- Badge animates (brief pulse) when region changes due to persona switch

### Region Context Card (Settings Page)

Below the persona switcher cards, show a region explanation card:
```
┌─────────────────────────────────────────────────────────┐
│  📍 Your Current Region                                  │
│                                                          │
│  Region: United States (East)                           │
│  Team: Team Alpha                                        │
│  Storage: regions/us-east-1/                            │
│  Destinations: 4 available                              │
│                                                          │
│  ℹ️ Region is determined by your team assignment.        │
│  Switch persona above to access a different region.      │
└─────────────────────────────────────────────────────────┘
```

### Connection Status Panel (below region card)
- **API Status**: Green dot + "Connected to localhost:3000" / Red dot + "Disconnected"
- **WebSocket**: Green dot + "Live updates active" / Yellow dot + "Reconnecting..." / Red dot + "Disconnected"
- **Last API Call**: `GET /api/jobs — 200 OK — 45ms` (monospace, updates on each call)
- **Active Persona Header Sent**: `x-user-id: user-1` (monospace)

---

## Shared Components

### Toast Notifications
- Types: success (green), error (red), info (blue), warning (amber)
- Auto-dismiss after 5s (errors persist until dismissed)
- Stack from bottom-right, max 3 visible
- Actions: dismiss (X), optional action button

### Loading States
- Page-level: centered spinner with "Loading..."
- Component-level: skeleton placeholders (shimmer)
- Button-level: spinner replacing text

### Error States
- API error: red banner at top of content area with error message + retry
- Network error: persistent banner "Connection lost. Retrying..."
- 401: redirect to sign-in (or show persona selector in dev)

### Confirmation Dialogs
- Used for: retry, clear files, cancel upload
- shadcn AlertDialog component
- Clear title, description, Cancel + Confirm buttons

### Progress Bars
- Thin (4px) for inline progress
- Standard (8px) for job/upload progress
- Color-coded: blue (active), green (complete), red (failed), gray (pending)
- Animated stripe pattern for "processing" state

---

## API Integration Reference

All API calls go through a centralized `api.ts` module.

### Base Configuration
```typescript
const API_BASE = '/api'; // Vite proxy handles forwarding to backend :3000
const headers = {
  'Content-Type': 'application/json',
  'x-user-id': getCurrentPersona(), // From persona switcher / auth context
};
```

### Endpoints Used by Frontend
| Endpoint | Method | Page | Purpose |
|----------|--------|------|---------|
| `/api/me` | GET | All | Get current user + team + region info |
| `/api/upload/presign` | POST | Upload | Get presigned S3 URL |
| `/api/upload/confirm` | POST | Upload | Confirm file in S3 |
| `/api/jobs` | POST | Upload | Create job with tasks |
| `/api/jobs` | GET | Jobs | List user's jobs |
| `/api/jobs/:jobId` | GET | Job Detail | Get job details |
| `/api/jobs/:jobId/tasks` | GET | Job Detail | Get tasks for job |
| `/api/jobs/:jobId/submit` | POST | Upload | Submit job for processing |
| `/api/tasks/:taskId/retry` | POST | Job Detail | Retry a failed task |
| `/api/destinations` | GET | Upload, Destinations | Get destinations for user's region |
| `/api/regions` | GET | Settings | List all supported regions (dev) |
| `/health` | GET | Settings | Connection check |

### WebSocket Integration
- Connect to WebSocket endpoint on page load
- Subscribe to job/task status events
- Message format:
  ```json
  {
    "type": "TASK_STATUS_UPDATE",
    "payload": { "jobId": "...", "taskId": "...", "status": "completed" }
  }
  ```
- Auto-reconnect with exponential backoff on disconnect

---

## Responsive Behavior

| Breakpoint | Behavior |
|-----------|----------|
| ≥1440px | Full layout, side-by-side panels |
| 1024–1439px | Compact layout, destination tree collapses to dropdown |
| 768–1023px | Stack layout, file list scrolls horizontally |
| <768px | Not a primary target; basic functionality via stacked cards |

---

## Accessibility Requirements

- All interactive elements keyboard-navigable
- Focus visible indicators (ring)
- ARIA labels on icon-only buttons
- Screen reader announcements for status changes (aria-live regions)
- Color is never the only indicator (always paired with text/icon)
- Minimum contrast ratio: 4.5:1 (WCAG AA)
- Drag-and-drop has keyboard alternative (browse button)

---

## Animation & Micro-interactions

- Page transitions: fade (150ms)
- Status badge changes: scale pulse (200ms)
- File added to list: slide-in from top
- Toast appearance: slide-in from right + fade
- Progress bar: smooth width transitions (300ms ease)
- Processing spinner: rotate (1s linear infinite)
- Hover states: subtle background color shift (100ms)

---

## Dark Mode Support

- Toggle in user menu (system / light / dark)
- Uses Tailwind `dark:` variants
- All custom colors have dark equivalents
- Charts/progress bars adjust for dark backgrounds

---

## Key User Flows to Support

1. **First-time upload**: Land on Upload → drop files → select destination → submit → see progress → redirected to job detail → watch tasks complete
2. **Monitor active jobs**: Navigate to Jobs → see active jobs updating in real-time → click into one → see task-level progress
3. **Retry failures**: Job Detail page → see failed tasks → click retry → task re-queues → watch it succeed
4. **Switch persona via nav dropdown**: Click avatar → quick switcher → select Bob Mueller → region badge changes to "🔵 EU-West" → toast confirms → jobs list refreshes showing Bob's jobs → destination tree now shows EU-West folders
5. **Switch persona via settings page**: Navigate to Settings → click David Okafor card → card highlights → everything refreshes to AP-Southeast context
6. **Cross-region verification**: As Alice (US-East), upload files → see them in "Regulatory/FDA Submissions" destination → switch to Bob (EU-West) → Alice's job disappears → Bob sees "EMA Submissions" destinations only → Bob uploads his own files → jobs are isolated
7. **Same team, different users**: Alice and Carol are both Team Alpha → both see same US-East destinations → but each only sees their own jobs (ownership isolation)

---

## File Structure (Expected Output)

```
src/
├── app/
│   ├── App.tsx              # Root component, router, providers
│   ├── api.ts              # API client (fetch wrapper, auth headers)
│   ├── websocket.ts        # WebSocket connection manager
│   └── store.ts            # Global state (user, persona, region)
├── components/
│   ├── ui/                 # shadcn components (button, dialog, toast, etc.)
│   ├── layout/
│   │   ├── AppShell.tsx    # Nav + content wrapper
│   │   ├── NavBar.tsx      # Top navigation
│   │   └── RegionBadge.tsx # Region indicator
│   ├── upload/
│   │   ├── FileDropZone.tsx
│   │   ├── FileList.tsx
│   │   ├── DestinationTree.tsx
│   │   ├── SubmitBar.tsx
│   │   └── UploadProgressModal.tsx
│   ├── jobs/
│   │   ├── JobCard.tsx
│   │   ├── JobFilters.tsx
│   │   ├── JobList.tsx
│   │   └── JobDetail.tsx
│   ├── tasks/
│   │   ├── TaskTable.tsx
│   │   ├── TaskRow.tsx
│   │   └── RetryButton.tsx
│   └── settings/
│       ├── PersonaSwitcher.tsx
│       └── ConnectionStatus.tsx
├── pages/
│   ├── UploadPage.tsx
│   ├── JobsPage.tsx
│   ├── JobDetailPage.tsx
│   ├── DestinationsPage.tsx
│   └── SettingsPage.tsx
├── hooks/
│   ├── useWebSocket.ts
│   ├── useJobs.ts
│   ├── useUpload.ts
│   └── usePersona.ts
├── types/
│   ├── job.ts
│   ├── task.ts
│   ├── file.ts
│   └── destination.ts
└── lib/
    ├── utils.ts
    └── constants.ts
```

---

## Design Constraints & Notes

1. **No authentication UI** — auth is mocked via header. The persona switcher replaces a login page for dev.
2. **No multi-destination** — P0 supports single destination per job. UI should not offer multi-select.
3. **No cancellation** — No cancel button on active jobs (P0 scope).
4. **Regional awareness** — Destination tree is filtered by user's region. Region is derived from team, not user-selected.
5. **Presigned URL pattern** — Frontend uploads directly to S3. The API never sees file bytes.
6. **File size limit** — 100MB per file. Enforce client-side with clear error message.
7. **Existing mockup reference** — The current Figma prototype at `rem-genius-52349022.figma.site` shows the basic layout concept. This prompt supersedes and expands that mockup into a complete, API-integrated frontend.
