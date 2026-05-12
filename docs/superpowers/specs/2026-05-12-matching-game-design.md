# Design Spec: Word Matching Game (Trò chơi Nối chữ)

**Date**: 2026-05-12
**Feature**: Lesson-based Word Matching Review
**Status**: Draft

## 1. Goal
Implement a dynamic word matching game within the "Review by Lesson" feature to help users practice character recognition by matching HanTu with its Pinyin and Meaning in a scrambled grid.

## 2. User Experience (UX)
- **Entry Point**: A new "Nối chữ" button will be added to the Lesson Selection cards or the Game Setup screen when a lesson is selected.
- **Gameplay**:
    - 4 words are selected from the current lesson.
    - Each word is split into 3 parts: **HanTu**, **Pinyin**, and **Meaning**.
    - These 12 parts are displayed as tiles in a randomized grid.
    - User must click 3 tiles (one of each type) to complete a set.
- **Feedback**:
    - **Correct**: Tiles turn green, play Chinese pronunciation audio, and fade out/disable.
    - **Incorrect**: Tiles turn red, vibrate (shake effect), and reset selection.
- **Progression**: After all 4 pairs are matched, a "Next" button appears or the next set of 4 words is automatically loaded.

## 3. UI Design
- **Layout**: A responsive grid (e.g., 3x4 or 4x3 depending on screen size).
- **Styling**:
    - Glassmorphism tiles with subtle hover/active states.
    - Colors: 
        - Default: Semi-transparent white/gray.
        - Selected: Blue glow.
        - Correct: Green glow/background.
        - Incorrect: Red glow/background.
- **Animations**:
    - `shake`: Horizontal vibration for incorrect matches.
    - `fade-out`: Smooth removal of matched tiles.

## 4. Technical Implementation

### 4.1. HTML Structure
```html
<div id="matching-screen" class="screen">
    <div class="matching-container">
        <div class="matching-header">
            <button class="back-btn"><i class="fas fa-arrow-left"></i></button>
            <h2>Nối Chữ</h2>
            <div class="matching-stats">Tiến độ: <span id="matching-progress">0/0</span></div>
        </div>
        <div id="matching-grid" class="matching-grid">
            <!-- Tiles generated dynamically -->
        </div>
    </div>
</div>
```

### 4.2. State Management
- `selectedTiles`: Array of currently clicked tile objects.
- `matchedCount`: Number of words successfully matched in the current round.
- `currentMatchingWords`: Array of the 4 words currently being played.

### 4.3. Logic Flow
1. `initMatchingGame(words)`: 
    - Slice the next 4 words from the lesson array.
    - Flatten into 12 "part" objects: `{ text, type, wordId }`.
    - Shuffle the array.
2. `renderMatchingGrid()`: Clear grid and create 12 button elements.
3. `handleTileClick(tileEl)`:
    - Add to `selectedTiles`.
    - If 3 tiles are selected:
        - Check if all 3 have the same `wordId`.
        - If yes: Trigger success (Green + Audio + Remove).
        - If no: Trigger failure (Red + Shake + Reset).

## 5. Success Criteria
- Users can access the game after selecting a lesson.
- 12 tiles appear and are properly scrambled.
- Matching logic correctly identifies sets of 3.
- Audio plays for each correct match.
- Grid is responsive on mobile and desktop.
