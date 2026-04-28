# Exam Scheduler Pro 🎓

نظام جدولة اختبارات جامعي متكامل مبني بـ Laravel + React + MySQL.

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Laravel 11 / PHP 8.2              |
| Frontend | React 18 + Vite                   |
| Database | MySQL 8                           |
| Export   | Laravel Excel + DomPDF            |

---

## Features

- رفع ملفات Excel لجداول المحاضرات وتحليلها تلقائياً
- عرض المختبرات المتاحة حسب اليوم والوقت والكلية
- طلب حجز اختبار مع تحديد الشعب التلقائي
- جدولة الاختبارات مع فحص التعارضات الكاملة (قاعة، محاضر، شعبة، سعة)
- تصدير الجدول (Excel / PDF)
- تقويم شامل مع فلاتر متقدمة
- سجل أحداث (Audit Log) في وضع بدون تسجيل دخول

---

## No-Login Mode

> هذا المشروع يعمل بدون صفحة تسجيل دخول.
> جميع الإجراءات تُسجَّل باسم **"Exam Coordinator"** بصلاحية **admin**.
> يمكن تغيير هذه البيانات من: `frontend/src/config/operator.js`

---

## Requirements

- PHP >= 8.1
- Composer
- MySQL 8
- Node.js >= 18
- npm >= 9

---

## Backend Setup

```bash
cd backend-php
composer install
cp .env.example .env
php artisan key:generate
```

### Configure `.env`

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=exam_scheduler
DB_USERNAME=root
DB_PASSWORD=your_password

EXAM_WORK_START=08:00
EXAM_WORK_END=18:00
EXAM_MIN_DURATION=30
EXAM_MAX_DURATION=240
```

### Run Migrations

```bash
php artisan migrate
```

### (Optional) Seed Rooms

```bash
php artisan db:seed --class=RoomSeeder
```

### Start Backend

```bash
php artisan serve
# Runs at http://127.0.0.1:8000
```

---

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

---

## Database Export (Fresh SQL Dump)

After running migrations:

```bash
mysqldump -u root -p exam_scheduler > exam_scheduler_fresh.sql
```

Or via phpMyAdmin: Export → Format: SQL → Go.

---

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `SQLSTATE[42S22]: Column not found: is_active` | Run `php artisan migrate` — InvigilatorService now uses `status` column |
| `Class CourseSectionService not found` | Run `composer dump-autoload` |
| `Vite manifest not found` | Run `npm run dev` or `npm run build` in `/frontend` |
| `CORS error` | Check `config/cors.php` — allowed_origins should include `http://localhost:5173` |
| `section_key mismatch` | Old records used instructor-based keys. Re-save exam requests after migration. |

---

## Project Structure

```
├── backend-php/          # Laravel API
│   ├── app/
│   │   ├── Http/Controllers/Api/
│   │   │   ├── ExamsController.php      # Main scheduling controller
│   │   │   ├── CoursesController.php
│   │   │   └── ...
│   │   └── Services/
│   │       ├── CourseSectionService.php # Section grouping & key generation
│   │       ├── SchedulingConflictService.php
│   │       ├── AuditLogService.php
│   │       └── ...
│   ├── database/migrations/
│   └── routes/api.php
│
└── frontend/             # React + Vite
    └── src/
        ├── config/operator.js   # No-login operator identity
        ├── api.js               # API layer with operator injection
        └── pages/
            ├── NewExam.jsx      # Exam request + scheduling
            ├── CalendarView.jsx # Calendar with filters
            └── ...
```

---

## Approval Workflow

```
draft/pending → submitted → pending_department_approval
             → department_approved → pending_registrar_approval
             → registrar_approved → (can be scheduled)

Any status → rejected  (requires comment)
Any status → cancelled
```

All transitions are logged in `request_approvals` and `audit_logs` tables.
