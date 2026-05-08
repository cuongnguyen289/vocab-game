# Design Specification: Stroke Order Animation (Hanzi Writer)

## Goal
Replace the static Chinese character display in the reveal overlay with a dynamic stroke order animation using the `Hanzi Writer` library. Provide user controls for replaying the animation and adjusting its speed.

## User Review Required
- [ ] Integration of the external `hanzi-writer` library via CDN.
- [ ] Automatic animation play on character reveal.
- [ ] UI for adjusting animation speed (0.5x to 3x).
- [ ] Replay button functionality.

## Proposed Changes

### HTML (`index.html`)
- **Library**: Add `<script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>` before `script.js`.
- **Overlay Update**:
    - Replace `<div id="large-char-display" class="large-char"></div>` with `<div id="hanzi-writer-container" class="large-char"></div>`.
    - Add a controls div containing a Replay button (`🔄`) and a Speed slider.

### CSS (`style.css`)
- **Writer Container**: Ensure `#hanzi-writer-container` has appropriate sizing (fixed width/height or responsive).
- **Controls Styling**: Style the replay button and speed slider for a modern, compact look.
- **Hide Static Display**: Remove or hide the old static text styles for `#large-char-display`.

### JavaScript (`script.js`)
- **Initialization**: Declare a global variable for the writer instance.
- **`showFullscreenReveal`**: 
    - Initialize `HanziWriter` on `#hanzi-writer-container` for the given character.
    - Call `writer.animateCharacter()` automatically.
    - Set the initial speed based on the slider value.
- **Controls Logic**:
    - Replay: Call `writer.animateCharacter()`.
    - Speed Slider: Update the `strokeAnimationSpeed` option of the writer instance dynamically.
- **Multi-character support**: Handle words with multiple characters (animate them sequentially or show them together if the library supports it).

## Verification Plan
1. Start a Pinyin typing game.
2. Type the correct Pinyin for a word.
3. Verify that the stroke animation plays automatically in the overlay.
4. Test the "Replay" button.
5. Adjust the speed slider and verify that the animation speed changes accordingly.
6. Verify the "Exit" button works as before.
