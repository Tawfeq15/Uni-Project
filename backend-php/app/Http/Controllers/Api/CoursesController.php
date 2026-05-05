<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CourseSectionService;
use Illuminate\Http\Request;

class CoursesController extends Controller
{
    public function __construct(
        protected CourseSectionService $courseSectionService
    ) {}

    public function index(Request $request)
    {
        $search = $request->query('search');
        $courses = $this->courseSectionService->getGroupedCourses($search);

        return response()->json([
            'success' => true,
            'data' => $courses,
        ]);
    }

    public function getSections(string $courseCode)
    {
        $data = $this->courseSectionService->getCourseSections($courseCode);

        if (!$data) {
            return response()->json([
                'success' => false,
                'message' => 'No sections found for this course code.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'course' => $data['course'],
            'sections' => $data['sections'],
            'summary' => $data['summary'],
        ]);
    }
}
