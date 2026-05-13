# Design Spec: Lesson Review Improvements & Simplified SRS

**Date:** 2026-05-13
**Status:** Draft

## 1. Goal
The primary objective is to enhance the "Review by Lesson" (Ôn tập theo bài học) feature by integrating it with the Spaced Repetition System (SRS), simplifying the leveling logic, and providing a visually rich progress display on the lesson selection screen.

## 2. Requirements
- **SRS Integration:** Lesson review must update word statistics.
- **Simplified Scoring:** 
    - Correct answer: +1 Level (max 5).
    - Incorrect answer: -1 Level (min 1).
- **Lesson Selection UI:**
    - Display counts for each level (L1 to L5) on each lesson card.
    - Display a segmented progress bar showing the distribution of levels within the lesson.
    - Explicitly show the count of words "In Progress" (L1-L4).
- **Cross-Mode Scoring:** Apply the +1/-1 logic to all review modes where applicable.

## 3. Technical Design

### 3.1 SRS Logic Update (`script.js`)
Modify `updateSRSProgress(hanTu, isCorrect, mode)`:
- Remove the `isLessonMode` early return.
- If `isCorrect`:
    - `stats.level = Math.min(Math.floor(stats.level) + 1, 5)`
- If `!isCorrect`:
    - `stats.level = Math.max(Math.floor(stats.level) - 1, 1)`
- Update `nextReview` based on the new level:
    - Level 1: `now + 1 hour`
    - Level 2: `now + 1 day`
    - Level 3: `now + 3 days`
    - Level 4: `now + 7 days`
    - Level 5: `now + 30 days`

### 3.2 Lesson Selection UI (`script.js`)
Update `goToLessonSelection()`:
- For each lesson in `lessonsGrouped`:
    - Iterate words and count levels using `wordStats`.
    - Generate a segmented progress bar using `display: flex`.
    - Colors for levels:
        - L1: `#94a3b8` (Slate)
        - L2: `#6366f1` (Indigo)
        - L3: `#10b981` (Emerald)
        - L4: `#f59e0b` (Amber)
        - L5: `#ec4899` (Pink)
    - Update the `innerHTML` of the lesson card.

### 3.3 CSS Styling (`style.css`)
Add styles for:
- `.lesson-progress-container`: The wrapper for the segmented bar.
- `.lesson-progress-segment`: Individual segments of the bar.
- `.lesson-level-grid`: A compact grid to show `L1: 5 | L2: 2...`
- `.in-progress-badge`: A badge highlighting the L1-L4 total.

## 4. Proposed UI Mockup (Text-based)
```
[ Bài 1: Chào hỏi ]
[ Progress Bar: █████░░░░░░░░░ ] (Colored by level distribution)
Đang học: 8/20 | L5: 12 ⭐
L1: 2 | L2: 3 | L3: 2 | L4: 1
```

## 5. Verification Plan
- **Manual Test:** 
    - Open "Review by Lesson".
    - Finish a session.
    - Verify levels increased/decreased in the main stats.
    - Check if the lesson card updates its counts and progress bar correctly.
- **Data Integrity:** Ensure guest and logged-in users both have their data updated correctly in LocalStorage/Firestore.
