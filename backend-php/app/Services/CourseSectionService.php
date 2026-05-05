<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * CourseSectionService
 *
 * Groups parsed_sessions into normalized course sections.
 *
 * section_key strategy:
 *   course_code + "-" + section_number
 *   (instructor is intentionally excluded to avoid duplicate counting
 *    when the same section has multiple sessions: theory + lab, different lecturers)
 *
 * student_count strategy:
 *   max(enrolled_count) across all rows for the same section.
 *   Rationale: theory rows carry the full class enrollment count;
 *   lab rows often carry a subset. Taking max() avoids under-counting.
 */
class CourseSectionService
{
    /**
     * Normalizes Arabic text by standardizing characters and removing extra whitespace.
     */
    public function normalizeArabicText(?string $text): string
    {
        if (!$text) return '';
        $text = trim($text);
        // Standardize Alif forms
        $text = preg_replace('/[أإآ]/u', 'ا', $text);
        // Standardize Ya
        $text = preg_replace('/ى/u', 'ي', $text);
        // Standardize Ta Marbuta
        $text = preg_replace('/ة/u', 'ه', $text);
        // Remove duplicate spaces
        $text = preg_replace('/\s+/u', ' ', $text);
        return $text;
    }

    /**
     * Build a stable section_key from course_code and section_number only.
     * Does NOT include instructor name.
     */
    public function buildSectionKey(string $courseCode, $sectionNumber): string
    {
        $sec = $sectionNumber ?? '0';
        return "{$courseCode}-{$sec}";
    }

    /**
     * Get unique courses with their total sections and students count.
     */
    public function getGroupedCourses(?string $search = null): array
    {
        $query = DB::table('parsed_sessions')
            ->whereNotNull('course_code')
            ->where('course_code', '!=', '')
            ->where('is_valid', 1);

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('course_code', 'like', '%' . $search . '%')
                  ->orWhere('course_name', 'like', '%' . $search . '%');
            });
        }

        $sessions = $query->get();

        $courses = [];

        foreach ($sessions as $session) {
            $code = $session->course_code;
            if (!isset($courses[$code])) {
                $courses[$code] = [
                    'course_code' => $code,
                    'course_name' => $session->course_name,
                    'sections'   => [],
                ];
            }

            // section_key: course_code + section_number only (no instructor)
            $sectionNumber = $session->section ?? '0';
            $sectionKey    = $this->buildSectionKey($code, $sectionNumber);

            if (!isset($courses[$code]['sections'][$sectionKey])) {
                $courses[$code]['sections'][$sectionKey] = [
                    'student_count' => (int) $session->enrolled_count,
                ];
            } else {
                // Strategy: max(enrolled_count) — theory rows carry total enrollment
                if ((int) $session->enrolled_count > $courses[$code]['sections'][$sectionKey]['student_count']) {
                    $courses[$code]['sections'][$sectionKey]['student_count'] = (int) $session->enrolled_count;
                }
            }
        }

        $result = [];
        foreach ($courses as $code => $courseData) {
            $sectionsCount  = count($courseData['sections']);
            $totalStudents  = array_sum(array_column($courseData['sections'], 'student_count'));

            $result[] = [
                'course_code'    => $code,
                'course_name'    => $courseData['course_name'],
                'sections_count' => $sectionsCount,
                'total_students' => $totalStudents,
            ];
        }

        // Sort by course code
        usort($result, fn($a, $b) => strcmp($a['course_code'], $b['course_code']));

        return $result;
    }

    /**
     * Get distinct sections for a specific course code.
     *
     * Returns full section objects including:
     *   - section_key (course_code-section_number, stable across instructors)
     *   - section_number
     *   - student_count (max strategy)
     *   - instructors[] (all unique instructors for this section)
     *   - instructor_name (primary/first instructor, for backward compat)
     *   - sessions[]
     *   - rooms[]
     *   - days_times[]
     */
    public function getCourseSections(string $courseCode): ?array
    {
        $sessions = DB::table('parsed_sessions')
            ->where('course_code', $courseCode)
            ->where('is_valid', 1)
            ->get();

        if ($sessions->isEmpty()) {
            return null;
        }

        $courseName = $sessions->first()->course_name;
        $sections   = [];

        foreach ($sessions as $session) {
            $sectionNumber = $session->section ?? '0';
            $sectionKey    = $this->buildSectionKey($courseCode, $sectionNumber);
            $instructor    = $session->lecturer ?? null;

            if (!isset($sections[$sectionKey])) {
                $sections[$sectionKey] = [
                    'section_key'     => $sectionKey,
                    'section_number'  => $session->section,
                    'course_code'     => $courseCode,
                    'course_name'     => $courseName,
                    'student_count'   => (int) $session->enrolled_count,
                    'instructors'     => [],
                    'instructor_name' => $instructor, // primary (first encountered)
                    'sessions'        => [],
                    'rooms'           => [],
                    'days_times'      => [],
                ];
            } else {
                // Strategy: max(enrolled_count) across all rows for same section
                if ((int) $session->enrolled_count > $sections[$sectionKey]['student_count']) {
                    $sections[$sectionKey]['student_count'] = (int) $session->enrolled_count;
                }
            }

            // Collect unique instructors
            if ($instructor && !in_array($instructor, $sections[$sectionKey]['instructors'])) {
                $sections[$sectionKey]['instructors'][] = $instructor;
                // Keep instructor_name as first discovered (primary)
                if (count($sections[$sectionKey]['instructors']) === 1) {
                    $sections[$sectionKey]['instructor_name'] = $instructor;
                }
            }

            // Append session details
            if ($session->day && $session->start_time && $session->end_time) {
                $sessionDetail = [
                    'day'           => $session->day,
                    'start_time'    => $session->start_time,
                    'end_time'      => $session->end_time,
                    'room'          => $session->room,
                    'activity_type' => $session->activity_type,
                    'lecturer'      => $instructor,
                ];
                $sections[$sectionKey]['sessions'][] = $sessionDetail;

                if ($session->room && !in_array($session->room, $sections[$sectionKey]['rooms'])) {
                    $sections[$sectionKey]['rooms'][] = $session->room;
                }

                $dayTime = $session->day . ' (' . $session->start_time . '-' . $session->end_time . ')';
                if (!in_array($dayTime, $sections[$sectionKey]['days_times'])) {
                    $sections[$sectionKey]['days_times'][] = $dayTime;
                }
            }
        }

        $sectionsList = array_values($sections);

        // Sort by section number
        usort($sectionsList, function ($a, $b) {
            return (int) $a['section_number'] <=> (int) $b['section_number'];
        });

        $totalStudents = array_sum(array_column($sectionsList, 'student_count'));

        return [
            'course' => [
                'course_code' => $courseCode,
                'course_name' => $courseName,
            ],
            'sections' => $sectionsList,
            'summary'  => [
                'sections_count' => count($sectionsList),
                'total_students' => $totalStudents,
            ],
        ];
    }

    /**
     * Given an array of section_key strings, resolve the full section objects
     * from the database and calculate the true total_students.
     *
     * Used by ExamsController to validate and recalculate from backend data.
     *
     * @param  string   $courseCode
     * @param  string[] $sectionKeys
     * @return array{ sections: array, total_students: int, error: string|null }
     */
    public function resolveSelectedSections(string $courseCode, array $sectionKeys): array
    {
        $allData = $this->getCourseSections($courseCode);

        if (!$allData) {
            return [
                'sections'       => [],
                'total_students' => 0,
                'error'          => "لم يتم العثور على بيانات للمادة {$courseCode}",
            ];
        }

        $sectionMap = [];
        foreach ($allData['sections'] as $sec) {
            $sectionMap[$sec['section_key']] = $sec;
        }

        $resolved      = [];
        $totalStudents = 0;
        $notFound      = [];

        foreach ($sectionKeys as $key) {
            if (isset($sectionMap[$key])) {
                $resolved[]     = $sectionMap[$key];
                $totalStudents += $sectionMap[$key]['student_count'];
            } else {
                $notFound[] = $key;
            }
        }

        $error = null;
        if (!empty($notFound)) {
            $error = 'الشعب التالية غير موجودة في البيانات: ' . implode(', ', $notFound);
        }

        return [
            'sections'       => $resolved,
            'total_students' => $totalStudents,
            'error'          => $error,
        ];
    }
}
