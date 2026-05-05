<?php

namespace App\Services;

use Carbon\Carbon;

/**
 * DayNormalizationService
 *
 * Authoritative service for all day-name normalization in the system.
 * Converts Arabic day names, abbreviations, timetable codes, and combined
 * day strings into canonical English lowercase day names.
 *
 * Canonical values: saturday | sunday | monday | tuesday | wednesday | thursday | friday
 */
class DayNormalizationService
{
    // ── Canonical English names ─────────────────────────────────────────

    public const CANONICAL_DAYS = [
        'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    ];

    // ── Arabic full names → canonical ───────────────────────────────────

    private const ARABIC_FULL = [
        'السبت'    => 'saturday',
        'الاحد'    => 'sunday',
        'الأحد'    => 'sunday',
        'احد'      => 'sunday',
        'أحد'      => 'sunday',
        'الاثنين'  => 'monday',
        'الإثنين'  => 'monday',
        'اثنين'    => 'monday',
        'إثنين'    => 'monday',
        'الثلاثاء' => 'tuesday',
        'ثلاثاء'   => 'tuesday',
        'الأربعاء' => 'wednesday',
        'الاربعاء' => 'wednesday',
        'اربعاء'   => 'wednesday',
        'أربعاء'   => 'wednesday',
        'الخميس'   => 'thursday',
        'خميس'     => 'thursday',
        'الجمعة'   => 'friday',
        'جمعة'     => 'friday',
    ];

    // ── Arabic single-letter abbreviations → canonical ──────────────────
    // Based on project mapping:
    // س=saturday, ح=sunday, ن=monday, ث=tuesday, ر=wednesday, خ=thursday, ج=friday

    private const ARABIC_CODES = [
        'س' => 'saturday',
        'ح' => 'sunday',
        'ن' => 'monday',
        'ث' => 'tuesday',
        'ر' => 'wednesday',
        'خ' => 'thursday',
        'ج' => 'friday',
    ];

    // ── English full/short names (already canonical or near-canonical) ──

    private const ENGLISH_NAMES = [
        'sat'       => 'saturday',
        'saturday'  => 'saturday',
        'sun'       => 'sunday',
        'sunday'    => 'sunday',
        'mon'       => 'monday',
        'monday'    => 'monday',
        'tue'       => 'tuesday',
        'tues'      => 'tuesday',
        'tuesday'   => 'tuesday',
        'wed'       => 'wednesday',
        'wednesday' => 'wednesday',
        'thu'       => 'thursday',
        'thur'      => 'thursday',
        'thursday'  => 'thursday',
        'fri'       => 'friday',
        'friday'    => 'friday',
    ];

    // ── PHP date('l') → canonical ───────────────────────────────────────

    private const PHP_DAY_MAP = [
        'Saturday'  => 'saturday',
        'Sunday'    => 'sunday',
        'Monday'    => 'monday',
        'Tuesday'   => 'tuesday',
        'Wednesday' => 'wednesday',
        'Thursday'  => 'thursday',
        'Friday'    => 'friday',
    ];

    // ─────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Derive canonical day name from a YYYY-MM-DD date string.
     * This is the AUTHORITATIVE method — always use this when exam_date is available.
     */
    public function dayFromDate(string $date): ?string
    {
        try {
            $carbon = Carbon::parse($date);
            return self::PHP_DAY_MAP[$carbon->format('l')] ?? null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Normalize a single day value (Arabic full name, abbreviation, or English).
     * Returns canonical string or null if unrecognizable.
     */
    public function normalizeDay(mixed $value): ?string
    {
        if (empty($value) || !is_string($value)) return null;

        $v = $this->clean($value);

        // Direct English lookup
        if (isset(self::ENGLISH_NAMES[$v])) return self::ENGLISH_NAMES[$v];

        // Arabic full name lookup
        foreach (self::ARABIC_FULL as $arabic => $canonical) {
            if ($this->cleanArabic($arabic) === $this->cleanArabic($v)) return $canonical;
        }

        // Arabic single code lookup
        if (mb_strlen($v) === 1 && isset(self::ARABIC_CODES[$v])) {
            return self::ARABIC_CODES[$v];
        }

        return null;
    }

    /**
     * Parse a day string that may contain multiple days.
     * Handles formats like: "ن، ر" | "ن, ر" | "ح ث خ" | "الاثنين والأربعاء" | "monday, wednesday"
     *
     * Returns array of canonical day names. Empty array = unknown.
     */
    public function normalizeDays(mixed $value): array
    {
        if (empty($value)) return [];

        // Try JSON first (stored as ["monday","wednesday"])
        if (is_array($value)) {
            $out = [];
            foreach ($value as $v) {
                $d = $this->normalizeDay($v);
                if ($d) $out[] = $d;
            }
            return array_values(array_unique($out));
        }

        if (is_string($value)) {
            // Try JSON decode
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                return $this->normalizeDays($decoded);
            }
        }

        $str = (string) $value;

        // Remove non-significant wrappers like ( ) and trailing text like "وجاهي"
        $str = preg_replace('/[()]/u', ' ', $str);
        // Remove mode words: وجاهي / عن_بعد / online / hybrid
        $str = preg_replace('/\b(وجاهي|عن\s*بعد|online|hybrid|مدمج)\b/ui', ' ', $str);
        // Remove time patterns like 09:00-10:00 or 09:00_10:00
        $str = preg_replace('/\d{1,2}[:_]\d{2}[-_]\d{1,2}[:_]\d{2}/', ' ', $str);
        $str = preg_replace('/\d{1,2}[:_]\d{2}/', ' ', $str);

        // Normalize separators: ،  ,  و  /  +  spaces
        $str = preg_replace('/[،,\/+و\s]+/u', ' ', $str);
        $str = trim($str);

        if (empty($str)) return [];

        // Split on whitespace and try each token
        $tokens = preg_split('/\s+/u', $str);
        $out    = [];
        foreach ($tokens as $token) {
            $token = trim($token);
            if (empty($token)) continue;
            $d = $this->normalizeDay($token);
            if ($d) $out[] = $d;
        }

        // Fallback: try the whole string as a single day name
        if (empty($out)) {
            $d = $this->normalizeDay($str);
            if ($d) $out[] = $d;
        }

        return array_values(array_unique($out));
    }

    /**
     * Extract days from a raw timetable text that may contain time + day codes.
     * Example: "( ن، ر وجاهي ) 09:00-10:00"  → ["monday", "wednesday"]
     * Example: "( ح، ث وجاهي ) 12:30-13:30"  → ["sunday", "tuesday"]
     */
    public function extractDaysFromRawText(string $text): array
    {
        // Try Arabic codes first (most common in timetable text)
        // Find sequences of Arabic day codes (ح, ث, ن, ر, خ, س, ج)
        preg_match_all('/[حثنرخسج]/u', $text, $matches);
        $days = [];
        foreach ($matches[0] as $code) {
            $d = self::ARABIC_CODES[$code] ?? null;
            if ($d) $days[] = $d;
        }
        if (!empty($days)) {
            return array_values(array_unique($days));
        }

        // Fallback to normalizeDays for the whole text
        return $this->normalizeDays($text);
    }

    /**
     * Check if exam_day is in the session's days array.
     * Returns true if there is a day intersection (potential conflict on that day).
     */
    public function daysIntersect(string $examDay, array $sessionDays): bool
    {
        return in_array($examDay, $sessionDays, true);
    }

    /**
     * Get canonical day for a session row from DB.
     * Tries multiple fields in priority order.
     *
     * @param object $session  Parsed session DB row
     * @param string|null $examDate  The exam date for context
     * @return array  ['days' => string[], 'confident' => bool]
     */
    public function getSessionDays(object $session, ?string $examDate = null): array
    {
        // 1. normalized_days JSON column (pre-computed)
        if (!empty($session->normalized_days)) {
            $days = $this->normalizeDays($session->normalized_days);
            if (!empty($days)) return ['days' => $days, 'confident' => true];
        }

        // 2. day column (canonical English or Arabic)
        if (!empty($session->day)) {
            $days = $this->normalizeDays($session->day);
            if (!empty($days)) return ['days' => $days, 'confident' => true];
        }

        // 3. raw_data_json (contains day codes like "ح وجاهي, ث وجاهي")
        if (!empty($session->raw_data_json)) {
            $raw = $session->raw_data_json;
            if (is_string($raw)) {
                // Decode JSON array if needed
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    // Find time/day cell — usually index 7 in the raw row
                    $text = implode(' ', array_filter(array_map('strval', $decoded)));
                } else {
                    $text = $raw;
                }
            } else {
                $text = '';
            }
            $days = $this->extractDaysFromRawText($text);
            if (!empty($days)) return ['days' => $days, 'confident' => true];
        }

        // 4. Cannot determine
        return ['days' => [], 'confident' => false];
    }

    // ─────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────

    private function clean(string $v): string
    {
        return strtolower(trim($v));
    }

    private function cleanArabic(string $v): string
    {
        // Remove tashkeel
        $v = preg_replace('/[\x{064B}-\x{065F}]/u', '', $v);
        // Normalize alef variants
        $v = preg_replace('/[أإآ]/u', 'ا', $v);
        return trim($v);
    }
}
