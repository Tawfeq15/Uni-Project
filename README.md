# 🎓 Lab Exam Scheduler Pro

A full-stack web application for scheduling university lab exams intelligently. Built for Arabic-language universities, the system parses faculty timetable Excel files, detects free lab slots, resolves conflicts, and generates final exam schedules — all through a clean, RTL-supported UI.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Pages & UI](#pages--ui)
- [Getting Started](#getting-started)
- [Business Rules](#business-rules)

---

## Overview

**Lab Exam Scheduler Pro** solves the complex problem of scheduling lab exams at a university without conflicts. It:

1. Accepts uploaded Excel timetable files from faculty departments.
2. Automatically parses both **grid-format** (room × time grid) and **flat-format** (one row per session) schedules.
3. Stores all parsed sessions in a local SQLite database.
4. Calculates **room availability** based on existing bookings (8:00 AM – 4:00 PM window).
5. Lets staff create **exam requests** and automatically find valid, conflict-free time slots.
6. Detects and reports **scheduling conflicts** (room double-booking, lecturer overlap).
7. Produces a **final exam schedule** that can be reviewed and exported.

The UI is built in **Arabic (RTL)** to match the university's language.

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | React 18, React Router v6, Recharts, Vite       |
| Backend    | PHP, Laravel Framework                          |
| Database   | SQLite (via Laravel ORM)                        |
| Parsing    | `phpoffice/phpspreadsheet` library              |
| Styling    | Vanilla CSS (custom design system, RTL-ready)   |

---

## Project Structure

```
Uni Project/
├── start-dev.bat        # Launches both backend & frontend servers
├── backend-php/         # Laravel PHP Backend
│   ├── app/             # Application Core (Controllers, Models, Services)
│   │   ├── Http/Controllers/Api/ # REST API Controllers
│   │   └── Services/    # Core business logic (Parser, Availability, Occupancy)
│   ├── config/          # Framework configuration
│   ├── database/        # Migrations and SQLite database file
│   ├── routes/          # API routes definitions
│   └── storage/         # Uploaded Excel files storage
│
└── frontend/            # React Frontend
    ├── index.html       # Main HTML file
    ├── vite.config.js   # Vite configuration (proxies /api to backend)
    └── src/
        ├── App.jsx         # Root router & layout
        ├── main.jsx        # React entry point
        ├── api.js          # Centralized Axios/fetch API client
        ├── index.css       # Global design system (RTL, dark theme)
        │
        ├── components/
        │   ├── Sidebar.jsx  # Navigation sidebar (Arabic labels)
        │   └── Toast.jsx    # Toast notifications
        │
        └── pages/
            ├── Dashboard.jsx      # Stats overview with charts
            ├── Uploads.jsx        # File upload & parse management
            ├── Sessions.jsx       # View & filter parsed sessions
            ├── Availability.jsx   # Room free-slot viewer by day
            ├── NewExam.jsx        # Create & auto-schedule exam requests
            ├── Conflicts.jsx      # View and resolve detected conflicts
            └── FinalSchedule.jsx  # Browse & export finalized exams
```

---

## Features

### 📁 File Upload & Parsing
- Upload `.xlsx` / `.xls` faculty timetable files.
- **Auto-detects format**: grid-style (room × time columns) or flat row-per-session.
- **Auto-detects faculty** from room numbers: `21xx` → Library building, `74xx` / `7325` → IT building.
- Parses Arabic day abbreviations (`ح`, `ث`, `خ` = Sun/Tue/Thu; `ن`, `ر` = Mon/Wed).
- Parses RTL time-range headers like `"9-8"`, `"10.30-9"`, `"4-2"`.
- Supports inline time overrides in cells (`فقط أحد`, `10:30 ل`).
- Extracts lecturer names (patterns like `د.`, `أ.`).

### 📅 Availability Engine
- Computes free slots per room per day within the **8:00 AM – 4:00 PM** work window.
- Academic period durations respected (e.g., Mon/Wed 8:00–9:30).
- Shows all rooms including fully booked ones for transparency.
- Rest/gap periods between sessions are calculated and displayed.

### 📝 Exam Request & Scheduling
- Staff submit exam requests with: course, lecturer, student count, preferred day, duration, room type.
- System finds the **first available conflict-free slot** automatically.
- Supports multi-room allocation when a single lab can't fit all students.
- Validates room capacity against student count.

### ⚠️ Conflict Detection
- Detects **room double-booking** (two exams in the same room at overlapping times).
- Detects **lecturer conflicts** (same lecturer scheduled in two places simultaneously).
- Conflicts are logged with severity levels (`error`, `warning`) and can be resolved.

### 📊 Dashboard
- Real-time stats: total uploaded files, parsed sessions, exam requests, scheduled exams.
- Charts (via Recharts) for visualization.
- Quick-action buttons to navigate key workflows.

---

## Database Schema

The SQLite database (`backend-php/database/exam_scheduler.db`) contains 6 tables:

| Table              | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| `uploaded_files`   | Metadata for each uploaded Excel file                    |
| `parsed_sessions`  | Every lecture session extracted from uploaded files      |
| `rooms`            | Lab/room registry with capacity and faculty              |
| `exam_requests`    | Pending exam scheduling requests from staff              |
| `scheduled_exams`  | Confirmed, conflict-free exam time slots                 |
| `conflicts`        | Detected scheduling conflicts with severity and context  |

---

## API Endpoints

| Method | Endpoint                          | Description                              |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/api/uploads`                    | Upload an Excel file                     |
| POST   | `/api/uploads/:id/reparse`        | Trigger parsing for an uploaded file     |
| GET    | `/api/uploads`                    | List all uploaded files                  |
| DELETE | `/api/uploads/:id`                | Delete an uploaded file and its sessions |
| GET    | `/api/sessions`                   | List all parsed sessions (filterable)    |
| GET    | `/api/availability/free-slots`    | Get free slots logically determined      |
| POST   | `/api/exams/requests`             | Create a new exam request                |
| GET    | `/api/exams/requests`             | List all exam requests                   |
| DELETE | `/api/exams/requests/:id`         | Delete an exam request                   |
| GET    | `/api/conflicts`                  | List all detected conflicts              |
| POST   | `/api/conflicts/rebuild`          | Detect all system conflicts              |
| GET    | `/api/schedule`                   | Get all scheduled exams                  |
| GET    | `/api/schedule/export/excel`      | Export Final Schedule as Excel File      |
| GET    | `/api/dashboard/stats`            | Get summary statistics                   |

---

## Pages & UI

| Route           | Page             | Description                                         |
|-----------------|------------------|-----------------------------------------------------|
| `/`             | Dashboard        | Overview stats, charts, quick actions               |
| `/uploads`      | Uploads          | Upload Excel files, trigger parsing, view status    |
| `/sessions`     | Sessions         | Browse all parsed lecture sessions with filters     |
| `/availability` | Availability     | View free time slots per lab room and day           |
| `/new-exam`     | New Exam         | Create exam requests, auto-find & book slots        |
| `/conflicts`    | Conflicts        | View scheduling conflicts and resolve them          |
| `/schedule`     | Final Schedule   | View and manage all finalized exam bookings         |

---

## Getting Started

### Prerequisites
- [PHP](https://www.php.net/) ^8.2 (With `sqlite3`, `zip`, `gd`, `fileinfo` extensions enabled)
- [Composer](https://getcomposer.org/) (For managing PHP dependencies)
- [Node.js](https://nodejs.org/) v18 or higher
- Windows OS (scripts are `.bat` files)

### Installation

```bat
# Step 1: Install Backend Dependencies
cd backend-php
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate

# Step 2: Install Frontend Dependencies
cd ../frontend
npm install
```

### Running the App

```bat
# Step 3: Start both servers and open the browser
start-dev.bat
```

This will:
- Start the **backend** (Laravel) on `http://localhost:8000`
- Start the **frontend** (Vite) on `http://localhost:5173`
- Open the app automatically in your browser

### Manual Start (Alternative)

```bash
# Backend
cd backend-php
php artisan serve

# Frontend (new terminal)
cd frontend
npm run dev
```

---

## Business Rules

- **Work Hours**: All scheduling is confined to **8:00 AM – 4:00 PM**, Sunday through Thursday.
- **Day Groups**:
  - `ح / ث / خ` → Sunday, Tuesday, Thursday
  - `ن / ر` → Monday, Wednesday
- **Academic Periods**:
  - Mon/Wed first period: **8:00 – 9:30**
  - Other days first period: **8:00 – 9:00** (standard 1-hour slots)
- **Room Naming**:
  - Rooms starting with `21xx` → Library building labs
  - Rooms starting with `74xx` or `7325` → IT building labs
- **Conflict Rules**: No room or lecturer can appear in two overlapping time slots on the same day.
- **Capacity Check**: Exam room(s) total capacity must be ≥ number of enrolled students.

---

> Built as a university project. Arabic RTL interface. SQLite-powered. No internet connection required after installation.
