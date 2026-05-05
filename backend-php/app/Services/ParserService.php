<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * Grid Schedule Parser
 * Handles Arabic-university-style timetable grids where:
 *   - Rows = Rooms (e.g. 2101, 2102...)
 *   - Sub-rows = Day groups (ح/ث/خ = Sun/Tue/Thu, ن/ر = Mon/Wed)
 *   - Columns = Time slots (headers like "9-8", "10.30-9", "4-2", etc.)
 *
 * Also supports the flat row-per-session format as a fallback.
 */
class ParserService
{
    const WORK_START = 480;  // 08:00 in minutes
    const WORK_END   = 960;  // 16:00 in minutes

    // ── Helpers ─────────────────────────────────────────────────────────────

    public function normalizeArabic(string $text): string
    {
        if (!$text) return '';
        $text = trim($text);
        $text = str_replace("\u{00A0}", ' ', $text); // NBSP
        $text = preg_replace('/[أإآ]/u', 'ا', $text);
        return mb_strtolower($text, 'UTF-8');
    }

    public function isAsyncOrOnline(?string $rawStr): bool
    {
        if (!$rawStr) return false;
        $s = $this->normalizeArabic($rawStr);
        return (bool) preg_match('/(غير متزامن|اونلاين|online|عن بعد|الكتروني|إلكتروني)/u', $s);
    }

    // ── Room & Faculty ───────────────────────────────────────────────────────

    public function getRoomInfo(?string $roomStr): array
    {
        if (!$roomStr) return ['type' => 'unknown', 'faculty' => 'unknown', 'capacity' => 0];
        // Aggressively remove all invisible characters and spaces
        $r = preg_replace('/[\p{Z}\p{C}]+/u', '', $roomStr);
        $r = strtoupper(trim($r));

        if ($this->isAsyncOrOnline($r)) return ['type' => 'online', 'faculty' => 'online', 'capacity' => 0];

        if (str_starts_with($r, '21')) {
            $num = (int)$r;
            if ($num === 2107) {
                return ['type' => 'lab', 'faculty' => 'library', 'capacity' => 36];
            }
            if ($num >= 2101 && $num <= 2106) {
                return ['type' => 'lab', 'faculty' => 'library', 'capacity' => 26];
            }
            return ['type' => 'lab', 'faculty' => 'library', 'capacity' => 26]; // fallback for other 21xx just in case
        }
        if (str_starts_with($r, '74')) {
            $cap = 26;
            if ($r === '7418') $cap = 18;
            if ($r === '7417') $cap = 20;
            if ($r === '7416') $cap = 24;
            return ['type' => 'lab', 'faculty' => 'it', 'capacity' => $cap];
        }
        if ($r === '7325') {
            return ['type' => 'lab', 'faculty' => 'it', 'capacity' => 24];
        }
        if (str_starts_with($r, '31') || str_starts_with($r, '33')) {
            $cap = 24;
            if ($r === '3301') $cap = 23;
            return ['type' => 'lab', 'faculty' => 'media', 'capacity' => $cap];
        }
        if (str_starts_with($r, '62') || str_starts_with($r, '63')) {
            $cap = 20;
            if ($r === '6304') $cap = 30;
            return ['type' => 'lab', 'faculty' => 'literature', 'capacity' => $cap];
        }
        if ($r === '3411') {
            return ['type' => 'lab', 'faculty' => 'law', 'capacity' => 24];
        }
        if (str_starts_with($r, '4')) {
            $cap = 23;
            if ($r === '4210') $cap = 25;
            if ($r === '4217') $cap = 22;
            if ($r === '4428' || $r === '4121') $cap = 21;
            return ['type' => 'lab', 'faculty' => 'architecture', 'capacity' => $cap];
        }

        return ['type' => 'room', 'faculty' => 'unknown', 'capacity' => 0];
    }

    public function isTargetLabRoom(?string $room): bool
    {
        if (!$room) return false;
        // Aggressively remove all invisible characters and spaces
        $r = preg_replace('/[\p{Z}\p{C}]+/u', '', $room);
        $r = strtolower(ltrim(trim((string) $r), '0'));
        
        $isLibrary = str_starts_with($r, '21');
        $isIT      = str_starts_with($r, '74') || $r === '7325';
        $isMedia   = in_array($r, ['3118', '3301', '3311']);
        $isArts    = in_array($r, ['6304', '6320', '6202']);
        $isLaw     = ($r === '3411');
        $isArch    = str_starts_with($r, '4') && in_array($r, ['4313', '4315', '4310', '4210', '4217', '4428', '4121']);
        
        return $isLibrary || $isIT || $isMedia || $isArts || $isLaw || $isArch;
    }

    // ── Time Helpers ─────────────────────────────────────────────────────────

    public function toMinutes(string $timeStr): int
    {
        if (!$timeStr) return 0;
        $parts = explode(':', $timeStr);
        return (int)$parts[0] * 60 + (int)($parts[1] ?? 0);
    }

    public function minutesToTime(int $min): string
    {
        $h = intdiv($min, 60);
        $m = $min % 60;
        return sprintf('%02d:%02d', $h, $m);
    }

    public function parseTimeHeader(?string $raw): ?array
    {
        if (!$raw) return null;
        $s = preg_replace('/\s+/', '', trim((string)$raw));
        if (!preg_match('/^(\d+)(?:[.،](\d+))?[-–](\d+)(?:[.،](\d+))?$/', $s, $m)) return null;

        $endH  = (int)$m[1];
        $endM  = isset($m[2]) && $m[2] !== '' ? (int)$m[2] : 0;
        $startH = (int)$m[3];
        $startM = isset($m[4]) && $m[4] !== '' ? (int)$m[4] : 0;

        if ($startH >= 1 && $startH <= 7) $startH += 12;
        if ($endH >= 1 && $endH <= 7) $endH += 12;

        $startMin = $startH * 60 + $startM;
        $endMin   = $endH * 60 + $endM;

        if ($endMin <= $startMin) {
            if ($endMin + 720 > $startMin && $endMin + 720 <= self::WORK_END) {
                $endMin += 720;
            } else {
                return null;
            }
        }

        $clampedStart = max(self::WORK_START, $startMin);
        $clampedEnd   = min(self::WORK_END, $endMin);
        if ($clampedStart >= $clampedEnd) return null;

        return ['start' => $clampedStart, 'end' => $clampedEnd];
    }

    // ── Day Mapping ──────────────────────────────────────────────────────────

    private array $dayPatterns = [
        ['re' => '/ا?ثنين|ن[\\/]ر|mon/iu',                       'days' => ['monday', 'wednesday']],
        ['re' => '/ا?ربعاء/iu',                                    'days' => ['wednesday']],
        ['re' => '/احد|ح[\\/]ث|sun/iu',                           'days' => ['sunday', 'tuesday', 'thursday']],
        ['re' => '/ثلاثاء/iu',                                     'days' => ['tuesday']],
        ['re' => '/خميس/iu',                                       'days' => ['thursday']],
        ['re' => '/^ن$/u',                                         'days' => ['monday']],
        ['re' => '/^ر$/u',                                         'days' => ['wednesday']],
        ['re' => '/^ح$/u',                                         'days' => ['sunday']],
        ['re' => '/^ث$/u',                                         'days' => ['tuesday']],
        ['re' => '/^خ$/u',                                         'days' => ['thursday']],
    ];

    public function parseDayCell(?string $raw): array
    {
        if (!$raw) return [];
        $s = trim((string)$raw);
        foreach ($this->dayPatterns as $pat) {
            if (preg_match($pat['re'], $s)) return $pat['days'];
        }
        $combined = [];
        if (mb_strpos($s, 'ح') !== false) $combined[] = 'sunday';
        if (mb_strpos($s, 'ث') !== false) $combined[] = 'tuesday';
        if (mb_strpos($s, 'خ') !== false) $combined[] = 'thursday';
        if (mb_strpos($s, 'ن') !== false) $combined[] = 'monday';
        if (mb_strpos($s, 'ر') !== false) $combined[] = 'wednesday';
        return $combined;
    }

    public function parseDayFlat(?string $raw): array
    {
        if (!$raw) return [];
        $s = $this->normalizeArabic($raw);
        $s = preg_replace('/[()_,.،\-–؛]/u', ' ', $s);
        $tokens = array_values(array_filter(preg_split('/\s+/u', $s)));
        $days = [];
        
        for ($i = 0; $i < count($tokens); $i++) {
            $token = $tokens[$i];
            $day = null;
            if (in_array($token, ['ح', 'احد', 'الاحد', 'sun', 'sunday']))   $day = 'sunday';
            elseif (in_array($token, ['ن', 'اثنين', 'الاثنين', 'mon', 'monday']))  $day = 'monday';
            elseif (in_array($token, ['ث', 'ثلاثاء', 'الثلاثاء', 'tue', 'tuesday'])) $day = 'tuesday';
            elseif (in_array($token, ['ر', 'اربعاء', 'الاربعاء', 'wed', 'wednesday'])) $day = 'wednesday';
            elseif (in_array($token, ['خ', 'خميس', 'الخميس', 'thu', 'thursday']))  $day = 'thursday';

            if ($day) {
                // Check if the next words indicate this specific day is async
                $isAsync = false;
                $next1 = $tokens[$i+1] ?? '';
                $next2 = $tokens[$i+2] ?? '';
                
                if (in_array($next1, ['اونلاين', 'online', 'الكتروني', 'إلكتروني'])) {
                    $isAsync = true;
                } elseif ($next1 === 'عن' && $next2 === 'بعد') {
                    $isAsync = true;
                } elseif ($next1 === 'غير' && $next2 === 'متزامن') {
                    $isAsync = true;
                }
                
                if (!$isAsync) {
                    $days[] = $day;
                }
            }
        }
        return array_values(array_unique($days));
    }

    public function parseTimeRange(?string $raw): ?array
    {
        if (!$raw) return null;
        $s = trim((string)$raw);
        preg_match_all('/(\d{1,2})[:.](\d{2})/u', $s, $matches, PREG_SET_ORDER);
        if (count($matches) < 2) return null;

        $t1 = (int)$matches[0][1] * 60 + (int)$matches[0][2];
        $t2 = (int)$matches[1][1] * 60 + (int)$matches[1][2];

        if ($t1 >= 60 && $t1 <= 7 * 60 + 59) $t1 += 720;
        if ($t2 >= 60 && $t2 <= 7 * 60 + 59) $t2 += 720;

        if ($t1 > $t2) [$t1, $t2] = [$t2, $t1];
        $t1 = max(self::WORK_START, $t1);
        $t2 = min(self::WORK_END, $t2);
        if ($t1 >= $t2) return null;

        return ['start' => $this->minutesToTime($t1), 'end' => $this->minutesToTime($t2)];
    }

    // ── Cell helpers ─────────────────────────────────────────────────────────

    public function cellText($cell): string
    {
        if ($cell === null || $cell === '') return '';
        return trim((string)$cell);
    }

    public function isCellEmpty(string $text): bool
    {
        return !$text || preg_match('/^[\s\-–_.]*$/', $text);
    }

    public function detectSheetFormat(array $rows): string
    {
        if (!$rows || count($rows) < 2) return 'flat';
        for ($r = 0; $r < min(4, count($rows)); $r++) {
            $row = $rows[$r];
            $timeHeaderCount = 0;
            foreach ($row as $cell) {
                if ($this->parseTimeHeader($this->cellText($cell)) !== null) $timeHeaderCount++;
            }
            if ($timeHeaderCount >= 3) return 'grid';
        }
        return 'flat';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GRID PARSER
    // ═══════════════════════════════════════════════════════════════════════

    public function parseGridSheet(array $rows, string $faculty): ?array
    {
        $sessions    = [];
        $timeColumns = [];
        $metaCols    = [];
        $currentRoom = null;
        $currentDays = [];

        foreach ($rows as $r => $row) {
            if (!$row || count(array_filter($row, fn($c) => !$this->isCellEmpty($this->cellText($c)))) === 0) continue;

            $cols = [];
            foreach ($row as $c => $cell) {
                $t = $this->parseTimeHeader($this->cellText($cell));
                if ($t) $cols[] = ['colIdx' => $c, 'start' => $t['start'], 'end' => $t['end']];
            }

            if (count($cols) >= 3) {
                $timeColumns = $cols;
                $minTimeCol  = min(array_column($cols, 'colIdx'));
                $metaCols    = range(0, $minTimeCol - 1);
                $currentRoom = null;
                $currentDays = [];

                foreach ($row as $cell) {
                    $days = $this->parseDayCell($this->cellText($cell));
                    if (count($days) > 0) {
                        $currentDays = $days;
                        break;
                    }
                }
                continue;
            }

            if (empty($timeColumns)) continue;

            foreach ($metaCols as $c) {
                $txt = $this->cellText($row[$c] ?? '');
                if ($this->isCellEmpty($txt)) continue;

                if (preg_match('/^\d{4}/', $txt) && $this->isTargetLabRoom(explode(' ', trim($txt))[0])) {
                    $currentRoom = explode(' ', trim($txt))[0];
                }
                $days = $this->parseDayCell($txt);
                if (count($days) > 0) $currentDays = $days;
            }

            if (!$currentRoom || empty($currentDays)) continue;

            foreach ($timeColumns as $tc) {
                $rawCell = $this->cellText($row[$tc['colIdx']] ?? '');
                if ($this->isCellEmpty($rawCell)) continue;

                $cellDays = $currentDays;
                if (preg_match('/فقط.*(احد|ح\b)/u', $rawCell)) $cellDays = ['sunday'];
                elseif (preg_match('/فقط.*(اثنين|ثنين|ن\b)/u', $rawCell)) $cellDays = ['monday'];
                elseif (preg_match('/فقط.*(ثلاثاء|ث\b)/u', $rawCell)) $cellDays = ['tuesday'];
                elseif (preg_match('/فقط.*(ربعاء|ر\b)/u', $rawCell)) $cellDays = ['wednesday'];
                elseif (preg_match('/فقط.*(خميس|خ\b)/u', $rawCell)) $cellDays = ['thursday'];

                $startMin = $tc['start'];
                $endMin   = $tc['end'];

                if (preg_match('/(\d{1,2})[.:،](\d{2})\s*[لL]/u', $rawCell, $eo)) {
                    $override = (int)$eo[1] * 60 + (int)$eo[2];
                    if ($override > $startMin && $override <= self::WORK_END) $endMin = $override;
                }

                if (preg_match('/[مM]ن\s*(\d{1,2})[.:،](\d{2})/u', $rawCell, $so)) {
                    $override = (int)$so[1] * 60 + (int)$so[2];
                    if ($override >= self::WORK_START && $override < $endMin) $startMin = $override;
                }

                $cleaned = preg_replace([
                    '/فقط\s*(احد|أحد|اثنين|ثلاثاء|ربعاء|خميس|ح|ث|خ|ن|ر)/u',
                    '/\d{1,2}[.:،]\d{2}\s*[لL]/u',
                    '/[مM]ن\s*\d{1,2}[.:،]\d{2}/u',
                    '/\s+/',
                ], ['', '', '', ' '], $rawCell);
                $cleaned = trim($cleaned);

                $courseName = null;
                $lecturer   = null;
                if (preg_match('/[دأ]\.[^\n\r(1-9)]+/u', $cleaned, $lm)) {
                    $lecturer   = trim($lm[0]);
                    $courseName = trim(str_replace($lm[0], '', $cleaned));
                } else {
                    $courseName = $cleaned ?: null;
                }

                $roomInfo = $this->getRoomInfo($currentRoom);

                foreach ($cellDays as $day) {
                    $sessions[] = [
                        'faculty'          => $roomInfo['faculty'] !== 'unknown' ? $roomInfo['faculty'] : $faculty,
                        'course_code'      => null,
                        'course_name'      => $courseName,
                        'section'          => null,
                        'activity_type'    => preg_match('/عملي|مختبر/u', $rawCell) ? 'عملي' : 'نظري',
                        'lecturer'         => $lecturer,
                        'room'             => $currentRoom,
                        'room_type'        => $roomInfo['type'],
                        'day'              => $day,
                        'start_time'       => $this->minutesToTime($startMin),
                        'end_time'         => $this->minutesToTime($endMin),
                        'duration_minutes' => $endMin - $startMin,
                        'capacity'         => 0,
                        'enrolled_count'   => 0,
                        'is_valid'         => 1,
                        'validation_note'  => null,
                        'raw_data_json'    => json_encode(['cell' => $rawCell, 'col' => $tc]),
                    ];
                }
            }
        }

        return count($sessions) > 0 ? $sessions : null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FLAT PARSER
    // ═══════════════════════════════════════════════════════════════════════

    public function parseFlatSheet(array $rows, string $faculty, array &$stats): array
    {
        if (!$rows || count($rows) < 2) return [];

        $headerRowIdx = 0;
        $headers = [];
        for ($i = 0; $i < min(5, count($rows)); $i++) {
            $row = $rows[$i];
            $s = implode(' ', array_map([$this, 'normalizeArabic'], array_map('strval', $row)));
            if (str_contains($s, 'room') || str_contains($s, 'قاعه') || str_contains($s, 'مختبر') ||
                str_contains($s, 'وقت') || str_contains($s, 'مقرر') || str_contains($s, 'ماده') || str_contains($s, 'يوم')) {
                $headerRowIdx = $i;
                $headers = array_map(fn($c) => $this->normalizeArabic((string)$c), $row);
                break;
            }
        }
        if (!$headers) $headers = array_map(fn($c) => $this->normalizeArabic((string)$c), $rows[0]);

        $find = function(array $candidates) use ($headers): int {
            foreach ($candidates as $c) {
                $nc = $this->normalizeArabic($c);
                foreach ($headers as $idx => $h) {
                    if (str_contains($h, $nc)) return $idx;
                }
            }
            return -1;
        };

        $colMap = [
            'room'       => $find(['القاعة', 'مختبر', 'room', 'hall', 'location']),
            'time'       => $find(['وقت', 'time', 'slot', 'timing']),
            'day'        => $find(['يوم', 'day']),
            'courseName' => $find(['اسم المقرر', 'المقرر', 'course name', 'ماده', 'subject', 'name']),
            'courseCode' => $find(['رمز المقرر', 'رمز', 'كود', 'code']),
            'section'    => $find(['ش', 'شعبه', 'section']),
            'capacity'   => $find(['السعة', 'سعه', 'capacity']),
            'enrolled'   => $find(['العدد', 'عدد', 'enrolled']),
            'lecturer'   => $find(['المحاضر', 'محاضر', 'دكتور', 'استاذ', 'lecturer', 'instructor', 'dr', 'doctor']),
            'activity'   => $find(['النشاط', 'نشاط', 'نوع', 'activity', 'type']),
        ];

        $sessions = [];
        for ($i = $headerRowIdx + 1; $i < count($rows); $i++) {
            $row = $rows[$i];
            if (!$row || count(array_filter($row)) === 0) continue;
            $stats['total_rows_seen']++;

            $get = fn(int $idx): string => ($idx >= 0 && $idx < count($row)) ? trim((string)($row[$idx] ?? '')) : '';

            $rawRoom     = $get($colMap['room']);
            $rawTime     = $get($colMap['time']);
            $rawDay      = $get($colMap['day']);
            $rawActivity = $get($colMap['activity']);

            $isAsync = $this->isAsyncOrOnline($rawRoom) || $this->isAsyncOrOnline($rawActivity) ||
                       $this->isAsyncOrOnline($rawTime) || $this->isAsyncOrOnline($rawDay);
            if ($isAsync) $stats['online_or_async_rows_count']++;

            $splitRooms  = array_filter(array_map('trim', preg_split('/[,،\/\\\\]/u', $rawRoom)));
            $uniqueRooms = array_values(array_unique($splitRooms));

            $timeRange = $this->parseTimeRange($rawTime) ?? $this->parseTimeRange($rawDay) ?? $this->parseTimeRange($rawRoom);
            $days = $this->parseDayFlat($rawDay) ?: $this->parseDayFlat($rawTime) ?: $this->parseDayFlat($rawRoom);

            if ($isAsync && !$uniqueRooms) {
                $sessions[] = $this->createSessionObj($row, $colMap, 'Online', ['type' => 'online', 'faculty' => 'online'], $days ? $days[0] : 'sunday', ['start' => '00:00', 'end' => '00:00']);
                continue;
            }

            if (!$uniqueRooms && !$timeRange) {
                $stats['skipped_rows_count']++;
                $stats['skipped_reasons'][] = "Row " . ($i + 1) . ": Missing both room and valid time/day tokens.";
                continue;
            }

            if (!$timeRange && !$isAsync) {
                $stats['skipped_rows_count']++;
                $stats['skipped_reasons'][] = "Row " . ($i + 1) . ": Could not parse time range from \"$rawTime\"";
                continue;
            }

            if (!$days && !$isAsync) {
                $stats['skipped_rows_count']++;
                $stats['skipped_reasons'][] = "Row " . ($i + 1) . ": Could not detect valid day tokens from \"$rawDay\"";
                continue;
            }

            $processRooms = $uniqueRooms ?: ['Online'];
            $processDays  = $days ?: ['sunday'];
            $processTime  = $timeRange ?? ['start' => '00:00', 'end' => '00:00'];

            foreach ($processRooms as $room) {
                $roomInfo = $this->getRoomInfo($room);
                if ($isAsync) {
                    $roomInfo = ['type' => 'online', 'faculty' => 'online'];
                    $room = 'Online';
                } elseif ($roomInfo['type'] === 'unknown') {
                    $stats['unknown_rooms'][] = $room;
                }
                $sessionFaculty = $roomInfo['faculty'] !== 'unknown' ? $roomInfo['faculty'] : $faculty;

                foreach ($processDays as $day) {
                    $sessions[] = $this->createSessionObj($row, $colMap, $room, $roomInfo, $day, $processTime, $sessionFaculty);
                }
            }
        }

        return $sessions;
    }

    private function createSessionObj(array $row, array $colMap, string $room, array $roomInfo, string $day, array $timeRange, string $sessionFaculty = 'unknown'): array
    {
        $get = fn(int $idx): string => ($idx >= 0 && $idx < count($row)) ? trim((string)($row[$idx] ?? '')) : '';
        $cap = (int)($get($colMap['capacity']) ?: 0);
        $enr = (int)($get($colMap['enrolled']) ?: 0);

        return [
            'faculty'          => $sessionFaculty ?: $roomInfo['faculty'],
            'course_code'      => $get($colMap['courseCode']) ?: null,
            'course_name'      => $get($colMap['courseName']) ?: null,
            'section'          => $get($colMap['section']) ?: null,
            'activity_type'    => $get($colMap['activity']) ?: null,
            'lecturer'         => $get($colMap['lecturer']) ?: null,
            'room'             => $room,
            'room_type'        => $roomInfo['type'],
            'day'              => $day,
            'start_time'       => $timeRange['start'],
            'end_time'         => $timeRange['end'],
            'duration_minutes' => $this->toMinutes($timeRange['end']) - $this->toMinutes($timeRange['start']),
            'capacity'         => $cap,
            'enrolled_count'   => $enr,
            'is_valid'         => 1,
            'validation_note'  => null,
            'raw_data_json'    => json_encode($row),
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MAIN ENTRY POINT
    // ═══════════════════════════════════════════════════════════════════════

    public function parseExcelFile(string $filePath, string $hintFaculty = 'unknown'): array
    {
        $spreadsheet = IOFactory::load($filePath);
        $sessions    = [];
        $roomSet     = [];
        $stats       = [
            'total_rows_seen'             => 0,
            'parsed_sessions_count'       => 0,
            'skipped_rows_count'          => 0,
            'skipped_reasons'             => [],
            'rooms_detected'              => [],
            'unknown_rooms'               => [],
            'online_or_async_rows_count'  => 0,
        ];

        foreach ($spreadsheet->getAllSheets() as $ws) {
            $rows = $ws->toArray(null, true, true, false);
            if (count($rows) < 2) continue;

            $fmt = $this->detectSheetFormat($rows);
            $sheetSessions = null;

            if ($fmt === 'grid') {
                $sheetSessions = $this->parseGridSheet($rows, $hintFaculty);
                if ($sheetSessions === null) {
                    $sheetSessions = $this->parseFlatSheet($rows, $hintFaculty, $stats);
                } else {
                    $stats['total_rows_seen'] += count($rows);
                }
            } else {
                $sheetSessions = $this->parseFlatSheet($rows, $hintFaculty, $stats);
            }

            if ($sheetSessions) {
                foreach ($sheetSessions as $s) {
                    if ($s['room']) {
                        $s['room'] = preg_replace('/[\p{Z}\p{C}]+/u', '', $s['room']); // Clean original room string
                    }

                    if ($s['room'] && $s['room'] !== 'Online') {
                        $roomInfo = $this->getRoomInfo($s['room']);
                        if ($roomInfo['type'] === 'unknown' || $roomInfo['type'] === 'room') {
                            $stats['skipped_rows_count']++;
                            $stats['skipped_reasons'][] = "Skipped non-lab room: " . $s['room'];
                            continue; // Skip all non-lab rooms!
                        }

                        $s['faculty']   = $roomInfo['faculty'] !== 'unknown' ? $roomInfo['faculty'] : $s['faculty'];
                        $s['room_type'] = $roomInfo['type'];
                        if (($roomInfo['capacity'] ?? 0) > 0) {
                            $s['capacity'] = $roomInfo['capacity'];
                        }
                    }

                    if ($s['faculty'] === 'unknown') $s['faculty'] = $hintFaculty;

                    $sessions[] = $s;

                    if ($s['room'] && $s['room'] !== 'Online') {
                        if (!isset($roomSet[$s['room']])) {
                            $roomSet[$s['room']] = ['capacity' => $s['capacity'] ?? 0, 'type' => $s['room_type'], 'faculty' => $s['faculty']];
                        } elseif (($s['capacity'] ?? 0) > $roomSet[$s['room']]['capacity']) {
                            $roomSet[$s['room']]['capacity'] = $s['capacity'];
                        }
                    }
                }
            }
        }

        $faculties = array_values(array_unique(array_filter(array_column($sessions, 'faculty'), fn($f) => $f && $f !== 'unknown' && $f !== 'online')));

        $rooms = [];
        foreach ($roomSet as $name => $info) {
            $stats['rooms_detected'][] = $name;
            $rooms[] = [
                'room_name' => $name,
                'room_type' => $info['type'] ?? 'room',
                'capacity'  => $info['capacity'],
                'faculty'   => $info['faculty'],
            ];
        }

        $stats['parsed_sessions_count'] = count($sessions);

        return ['sessions' => $sessions, 'rooms' => $rooms, 'faculties' => $faculties, 'stats' => $stats, 'errors' => []];
    }
}
