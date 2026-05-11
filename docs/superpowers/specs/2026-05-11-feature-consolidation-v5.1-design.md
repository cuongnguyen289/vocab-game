# Design Spec - Feature Consolidation and UI Enhancement (v5.1)

Consolidate vocabulary game modes into logical groups, implement dynamic window titles, and finalize the interactive writing experience.

## Goals
- **UX Efficiency**: Group 6+ game modes into 4 clear categories to reduce cognitive load.
- **Visual Context**: Add a premium "Mode Title" banner to the quiz screen so users always know what they are practicing.
- **Feature Completion**: Finalize the interactive Hanzi writing mode with "Skip" functionality and improved canvas logic.
- **Consistency**: Ensure all screens (History, Setup, Results) have matching modern headers.

## Proposed Changes

### 1. UI Structure (`index.html`)
- **Quiz Screen**: Add a `.mode-title-banner` div above the score/progress area.
- **Writing Container**: Ensure the `writing-quiz-container` is properly positioned and contains the new `writing-skip-btn`.
- **Headers**: Standardize the `<h1>` and icon structure across all `.screen` elements.

### 2. Styling (`style.css`)
- **Banner Design**: 
    - `backdrop-filter: blur(10px)` for a modern glass look.
    - Gradient text or subtle background highlighting.
    - Responsive padding for mobile.
- **Writing Canvas**: Improve the grid background and border feedback.
- **Grouping**: Add styles for grouped buttons in the setup screen.

### 3. Application Logic (`script.js`)
- **Mode Mapping**: Implement `getModeTitle(mode)` to return user-friendly Vietnamese strings with emojis.
- **Button Grouping**: Update `renderDynamicButtons` to create the 4-group layout:
    1. **Trắc Nghiệm Tổng Hợp** (`vocab-mcq`)
    2. **Luyện Viết & Gõ** (`vocab-writing` - a mix of drawing and typing)
    3. **Luyện Phát Âm** (`speech-challenge`)
    4. **Thử Thách** (`vocab-challenge`)
- **Writing Mode**: 
    - Consolidate `draw-hanzi`, `type-pinyin`, and `type-hanzi` into a single "Writing & Typing" flow if needed, or keep them as sub-options.
    - Implement the `writing-skip-btn` logic.
    - Fix the target div creation in `loadWritingQuiz` to prevent duplicate IDs.
- **Initialization**: Update `startGame` to set the window title and clear any previous mode-specific UI states.

## Verification Plan
- **Manual Test**: 
    - Select each of the 4 main groups and verify the correct mode starts.
    - Check if the "Banner" title matches the selected mode.
    - Test "Skip" in drawing mode.
    - Verify that all screens (History, Settings) have consistent headers.
- **Regression**: Ensure standard MCQ and Sentence modes still work as expected.
