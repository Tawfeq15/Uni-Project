<?php

namespace App\Services;

use DateTime;
use Carbon\Carbon;

class DateTimeNormalizationService
{
    /**
     * Map English day names to Arabic and vice versa
     */
    protected array $dayMap = [
        'sunday'    => 'الأحد',
        'monday'    => 'الاثنين',
        'tuesday'   => 'الثلاثاء',
        'wednesday' => 'الأربعاء',
        'thursday'  => 'الخميس',
        'friday'    => 'الجمعة',
        'saturday'  => 'السبت',
        
        'الأحد'     => 'sunday',
        'الاثنين'   => 'monday',
        'الثلاثاء'  => 'tuesday',
        'الأربعاء'  => 'wednesday',
        'الخميس'   => 'thursday',
        'الجمعة'    => 'friday',
        'السبت'     => 'saturday',
    ];

    /**
     * Normalize date to YYYY-MM-DD
     */
    public function normalizeDate($value): ?string
    {
        if (empty($value)) return null;

        // 1. Convert Excel Serial Dates
        if (is_numeric($value)) {
            return $this->parseExcelDate((int)$value);
        }

        // Convert standard string representation
        $value = trim($value);

        // 2. Fix Arabic Numerals to English
        $value = $this->parseArabicNumerals($value);

        try {
            // 3. Try standard formats
            // Matches YYYY-MM-DD or YYYY/MM/DD
            if (preg_match('/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/', $value)) {
                return Carbon::parse(str_replace('/', '-', $value))->format('Y-m-d');
            }

            // Matches DD-MM-YYYY or DD/MM/YYYY
            if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/', $value, $matches)) {
                $day = str_pad($matches[1], 2, '0', STR_PAD_LEFT);
                $month = str_pad($matches[2], 2, '0', STR_PAD_LEFT);
                $year = $matches[3];
                // Assuming DD/MM/YYYY is preferred in this region
                return "{$year}-{$month}-{$day}";
            }

            // Fallback to Carbon parse
            return Carbon::parse($value)->format('Y-m-d');
            
        } catch (\Exception $e) {
            return null; // Could not normalize
        }
    }

    /**
     * Normalize time to HH:MM or HH:MM:SS
     */
    public function normalizeTime($value): ?string
    {
        if (empty($value)) return null;

        $value = trim($value);
        $value = $this->parseArabicNumerals($value);

        // Matches Excel decimal time e.g., 0.5 for 12:00, 0.729 for 17:30
        if (is_numeric($value) && $value < 1 && $value >= 0) {
            $totalMinutes = round((float)$value * 24 * 60);
            $hours   = intdiv($totalMinutes, 60) % 24;
            $minutes = $totalMinutes % 60;
            // Excel decimals 0.0417–0.2916 = 1:00–7:00 AM in raw terms,
            // but for university scheduling these should be PM (13:00–19:00)
            if ($hours >= 1 && $hours <= 7) {
                $hours += 12;
            }
            return sprintf('%02d:%02d:00', $hours, $minutes);
        }

        // Handle dots instead of colons (e.g. 10.30 instead of 10:30)
        // Only do this if it's not a pure numeric value to avoid breaking Excel decimals
        $value = str_replace('.', ':', $value);

        try {
            $parsed = Carbon::parse($value);
            $hour = (int)$parsed->format('H');
            
            // If hour is between 1 and 7 (inclusive), and it's not explicitly marked AM/PM,
            // assume it's PM (13:00 - 19:00) for university exams.
            if ($hour >= 1 && $hour <= 7 && !preg_match('/(am|pm|صباحاً|مساءً)/ui', $value)) {
                $parsed->addHours(12);
            }
            
            return $parsed->format('H:i:s');
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Extract start_time and end_time from a time range string
     * Solves RTL formatting issues where times are backward e.g., 11:00-10:00
     */
    public function normalizeTimeRange($value): array
    {
        if (empty($value)) return ['start_time' => null, 'end_time' => null];
        
        $value = trim($value);
        $value = $this->parseArabicNumerals($value);
        
        // Sometimes ranges are separated by -, /, ,, "to", or "إلى"
        $parts = preg_split('/(\-|\/|,|،|\bto\b|\sإلى\s)/ui', $value);
        if (count($parts) >= 2) {
            $t1 = $this->normalizeTime($parts[0]);
            $t2 = $this->normalizeTime(array_pop($parts)); // use last part as t2 in case of empty middle splits
            
            if ($t1 && $t2) {
                // If t1 > t2, it was probably RTL inverted
                if (strtotime($t1) > strtotime($t2)) {
                    return ['start_time' => $t2, 'end_time' => $t1];
                }
                return ['start_time' => $t1, 'end_time' => $t2];
            }
        }
        
        // If could not split, just return it as start time
        return ['start_time' => $this->normalizeTime($value), 'end_time' => null];
    }

    /**
     * Parse Excel Serial Date
     */
    public function parseExcelDate(int $serial): ?string
    {
        // Excel epoch is 1899-12-30
        if ($serial > 0) {
            return Carbon::create(1899, 12, 30)->addDays($serial)->format('Y-m-d');
        }
        return null;
    }

    /**
     * Parse Arabic numerals (١٢٣) to English (123)
     */
    public function parseArabicNumerals(string $string): string
    {
        $arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        $english = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        return str_replace($arabic, $english, $string);
    }

    /**
     * Calculate English day name from YYYY-MM-DD
     */
    public function calculateDayFromDate(?string $date): ?string
    {
        if (!$date) return null;
        try {
            return strtolower(Carbon::parse($date)->englishDayOfWeek);
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Calculate Arabic day name from YYYY-MM-DD
     */
    public function calculateArabicDayFromDate(?string $date): ?string
    {
        $englishDay = $this->calculateDayFromDate($date);
        return $englishDay ? ($this->dayMap[$englishDay] ?? null) : null;
    }

    /**
     * Validates if a date is not in the past
     */
    public function validateExamDate(string $date, bool $allowPast = false): bool
    {
        if ($allowPast) return true;
        
        try {
            $parsed = Carbon::parse($date)->startOfDay();
            $today = Carbon::now()->startOfDay();
            return $parsed->greaterThanOrEqualTo($today);
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Resolve frontend vs backend day mismatch
     */
    public function resolveDayAndDate(?string $frontendDay, ?string $date): array
    {
        if (!$date) {
            $mapped = $frontendDay ? ($this->dayMap[$frontendDay] ?? strtolower($frontendDay)) : null;
            return ['day' => $mapped, 'warning' => null];
        }

        $calculatedDay = $this->calculateDayFromDate($date);
        $warning = null;

        if ($frontendDay) {
            $englishFrontendDay = $this->dayMap[$frontendDay] ?? strtolower($frontendDay);
            if ($englishFrontendDay !== $calculatedDay) {
                $warning = "اليوم الموجود في الملف لا يطابق التاريخ، وتم اعتماد اليوم حسب التاريخ.";
            }
        }

        return ['day' => $calculatedDay, 'warning' => $warning];
    }
}
