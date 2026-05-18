<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\UploadsController;
use App\Http\Controllers\Api\SessionsController;
use App\Http\Controllers\Api\AvailabilityController;
use App\Http\Controllers\Api\ExamsController;
use App\Http\Controllers\Api\ConflictsController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ScheduleController;
use App\Http\Controllers\Api\RoomsController;
use App\Http\Controllers\Api\BlackoutDatesController;
use App\Http\Controllers\Api\CoursesController;
use App\Http\Controllers\Api\ExamImportsController;

// Health check
Route::get('/health', fn() => response()->json(['status' => 'ok', 'timestamp' => now()->toISOString()]));

// Courses
Route::get('/courses',                 [CoursesController::class, 'index']);
Route::get('/courses/{code}/sections', [CoursesController::class, 'getSections']);

// Uploads
Route::post('/uploads',              [UploadsController::class, 'store']);
Route::get('/uploads',               [UploadsController::class, 'index']);
Route::delete('/uploads/{id}',       [UploadsController::class, 'destroy']);
Route::post('/uploads/{id}/reparse', [UploadsController::class, 'reparse']);

// Rooms
Route::get('/rooms/available',  [RoomsController::class, 'available']);
Route::get('/rooms',          [RoomsController::class, 'index']);
Route::post('/rooms',         [RoomsController::class, 'store']);
Route::put('/rooms/{id}',     [RoomsController::class, 'update']);
Route::delete('/rooms/{id}',  [RoomsController::class, 'destroy']);


// Sessions
Route::get('/sessions',              [SessionsController::class, 'index']);
Route::get('/sessions/all-invalid',  [SessionsController::class, 'allInvalid']);
Route::get('/sessions/filters',      [SessionsController::class, 'filters']);

// Availability
Route::get('/availability/free-slots',                       [AvailabilityController::class, 'freeSlots']);
Route::get('/availability/rooms',                            [AvailabilityController::class, 'rooms']);
Route::get('/availability/active-sessions',                  [AvailabilityController::class, 'activeSessions']);
Route::get('/availability/room/{room}/day/{day}/sessions',   [AvailabilityController::class, 'roomDaySessions']);
Route::get('/availability/room/{room}/day/{day}',            [AvailabilityController::class, 'roomDay']);
Route::get('/availability/summary',                          [AvailabilityController::class, 'summary']);


// Exam Requests
Route::post('/exams/requests',                        [ExamsController::class, 'createRequest']);
Route::get('/exams/requests',                         [ExamsController::class, 'listRequests']);
Route::get('/exams/requests/{id}',                    [ExamsController::class, 'showRequest']);
Route::delete('/exams/requests/{id}',                 [ExamsController::class, 'destroyRequest']);
Route::post('/exams/requests/{id}/submit',            [ExamsController::class, 'submitRequest']);
Route::post('/exams/requests/{id}/approve',           [ExamsController::class, 'approveRequest']);
Route::post('/exams/requests/{id}/reject',            [ExamsController::class, 'rejectRequest']);
Route::post('/exams/requests/{id}/cancel',            [ExamsController::class, 'cancelRequest']);
Route::get('/exams/requests/{id}/approvals',          [ExamsController::class, 'listApprovals']);

// Exam Scheduling
Route::post('/exams/suggest-slot',    [ExamsController::class, 'suggestSlot']);
Route::post('/exams/schedule',        [ExamsController::class, 'schedule']);
Route::get('/exams/scheduled',                [ExamsController::class, 'listScheduled']);
Route::get('/exams/scheduled/{id}',           [ExamsController::class, 'showScheduled']);
Route::put('/exams/scheduled/{id}',           [ExamsController::class, 'updateScheduled']);
Route::delete('/exams/scheduled/{id}',        [ExamsController::class, 'destroyScheduled']);
Route::post('/exams/scheduled/{id}/reschedule',[ExamsController::class, 'rescheduleScheduled']);
Route::post('/exams/scheduled/{id}/cancel',   [ExamsController::class, 'cancelScheduled']);
Route::get('/exams/scheduled/{id}/audit',     [ExamsController::class, 'getAudit']);
Route::get('/exams/lecturers',                [ExamsController::class, 'getLecturers']);

// Exam Schedule Imports
Route::post('/exams/import/preview',  [ExamImportsController::class, 'preview']);
Route::post('/exams/import/confirm',  [ExamImportsController::class, 'confirm']);
Route::get('/exams/imports',          [ExamImportsController::class, 'index']);
Route::get('/exams/imports/{id}',     [ExamImportsController::class, 'show']);
Route::delete('/exams/imports/{id}',  [ExamImportsController::class, 'destroy']);

// Conflicts
Route::post('/conflicts/rebuild', [ConflictsController::class, 'rebuild']);
Route::get('/conflicts',          [ConflictsController::class, 'index']);

// Import Conflict Workflow
use App\Http\Controllers\Api\ConflictWorkflowController;
Route::get('/exams/import/conflicts', [ConflictWorkflowController::class, 'getImportConflicts']);
Route::post('/conflicts/groups/{id}/items/{itemId}/approve', [ConflictWorkflowController::class, 'approveItem']);
Route::post('/conflicts/groups/{id}/items/{itemId}/reject', [ConflictWorkflowController::class, 'rejectItem']);
Route::post('/conflicts/groups/{id}/items/{itemId}/reschedule', [ConflictWorkflowController::class, 'rescheduleItem']);
Route::post('/conflicts/groups/{id}/ignore-warning', [ConflictWorkflowController::class, 'ignoreWarning']);

// Dashboard
Route::get('/dashboard/stats',  [DashboardController::class, 'stats']);
Route::post('/dashboard/reset', [DashboardController::class, 'reset']);

// Schedule Export
Route::get('/schedule',                [ScheduleController::class, 'index']);
Route::delete('/schedule',             [ScheduleController::class, 'clear']);
Route::get('/schedule/export/excel',   [ScheduleController::class, 'exportExcel']);
Route::get('/schedule/export/pdf',     [ScheduleController::class, 'exportPdf']);

// Blackout Dates
Route::get('/blackout-dates',          [BlackoutDatesController::class, 'index']);
Route::post('/blackout-dates',         [BlackoutDatesController::class, 'store']);
Route::delete('/blackout-dates/{id}',  [BlackoutDatesController::class, 'destroy']);

// ── Final Computerized Import (استيراد النهائي المحوسب) ────────────────────
// ISOLATED FEATURE — does not affect any existing import workflow
use App\Http\Controllers\Api\FinalComputerizedImportController;
Route::get('/final-computerized-imports/available-labs', [FinalComputerizedImportController::class, 'availableLabs']);
Route::post('/final-computerized-imports/preview',       [FinalComputerizedImportController::class, 'preview']);
Route::get('/final-computerized-imports',                [FinalComputerizedImportController::class, 'index']);
Route::get('/final-computerized-imports/{id}',           [FinalComputerizedImportController::class, 'show']);
Route::get('/final-computerized-imports/{id}/rows',      [FinalComputerizedImportController::class, 'rows']);
Route::post('/final-computerized-imports/{id}/assign-labs', [FinalComputerizedImportController::class, 'assignLabs']);
Route::post('/final-computerized-imports/{id}/confirm',  [FinalComputerizedImportController::class, 'confirm']);
Route::get('/final-computerized-imports/{id}/export-excel', [FinalComputerizedImportController::class, 'exportExcel']);
