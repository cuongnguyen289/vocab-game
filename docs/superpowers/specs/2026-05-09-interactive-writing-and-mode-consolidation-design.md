# Design Specification: Interactive Writing & Mode Consolidation

## Goal
Consolidate the existing 9 vocabulary game modes into 4 logical groups to simplify the UI, and implement a new "Interactive Writing" feature using Hanzi Writer's quiz mode.

## User Review Required
- [ ] Grouping of existing modes into 4 categories.
- [ ] UI layout for the new Interactive Writing canvas.
- [ ] Sequential writing logic for multi-character words.

---

## 1. Mode Consolidation (Tái cấu trúc chế độ học)

The current `renderDynamicButtons` function will be updated to display 4 primary categories for the "Học Từ Vựng" (Vocab) mode:

| Group Name (VN) | Sub-modes Included | ID / Slug |
| :--- | :--- | :--- |
| **Trắc Nghiệm Tổng Hợp** | `han-viet`, `viet-han`, `review` | `vocab-mcq` |
| **Luyện Viết & Gõ** | `type-pinyin`, `type-hanzi`, `draw-hanzi` (NEW) | `vocab-writing` |
| **Luyện Phát Âm** | `speech-challenge` | `vocab-speech` |
| **Chế Độ Thử Thách** | `time-attack`, `survival` | `vocab-challenge` |

### UI Change:
- **Direct Action:** Clicking a category starts the mode directly using a mix of its sub-modes.
- **`vocab-mcq`**: Randomly chooses between Hán-Việt and Việt-Hán for each question.
- **`vocab-writing`**: Alternates between Typing Pinyin, Typing Hanzi, and Drawing Hanzi (newly added).
- **Buttons Appearance:** Use larger, card-like buttons with icons and descriptions.

---

## 2. Interactive Writing (Luyện Viết Tương Tác)

### New Game Mode Component: `draw-hanzi`
This mode will be integrated into the `vocab-writing` group.

#### UI Elements (`quiz-screen`):
- **Question Area:** Show the Vietnamese meaning or Pinyin of the target word.
- **Drawing Canvas:** A large `#writing-quiz-container` (300x300px) centered on the screen.
- **Controls:**
    - **Undo/Reset:** Clear the current character.
    - **Hint:** Briefly show the next stroke or the full character silhouette.
    - **Skip:** Move to the next word (penalty applies).

#### Logic Flow:
1. **Load Question:** Identify the target Hanzi word.
2. **Character Loop:** If the word has multiple characters (e.g., "学习"):
    - Initialize `HanziWriter.quiz()` for the first character "学".
    - Upon successful completion, show a brief success animation and initialize the quiz for "习".
3. **Completion:** Once all characters are written, trigger the standard "Correct Answer" flow (play audio, show example, update SRS).

---

## 3. Technical Implementation Details

### HTML (`index.html`)
- Add `#writing-quiz-container` inside the `quiz-screen`.
- Add a control bar for writing (Hint, Clear buttons).

### CSS (`style.css`)
- Style the writing container with a grid background (田字格).
- Add specific styles for the hint and clear buttons.

### JavaScript (`script.js`)
- **`renderDynamicButtons`**: Update to the 4-group layout.
- **`startGame`**: Update to handle the new grouped IDs.
- **`loadQuestion`**: Logic to initialize `HanziWriter.quiz` when the mode involves drawing.
- **SRS Update:** Drawing characters should provide a full boost (1.0 or 1.2) to the word's level.

---

## 4. Verification Plan
1. Select "Luyện Viết & Gõ".
2. Verify that the "Draw Hanzi" mode triggers correctly when selected by the randomizer (or specifically if implemented as a direct choice).
3. Verify the canvas responds to touch/mouse and correctly validates strokes.
4. Verify multi-character words work sequentially.
5. Check if SRS progress is correctly updated.
