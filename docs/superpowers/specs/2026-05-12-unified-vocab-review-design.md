# Design Spec - Hệ thống Ôn tập Từ vựng Tập trung (Unified Vocab Review)

Tái cấu trúc màn hình học từ vựng để tập trung vào việc chọn Cấp độ trước, sau đó chọn 1 trong 4 chế độ kỹ năng cụ thể. Xóa bỏ các rào cản cấp độ để người dùng tự do lựa chọn cách học.

## Mục tiêu
- **Trải nghiệm người dùng (UX)**: Đơn giản hóa quy trình học (Chọn Level -> Chọn Chế độ).
- **Tính linh hoạt**: Cho phép học mọi kỹ năng (Gõ, Viết, Trắc nghiệm) ở bất kỳ trình độ nào.
- **Tính nhất quán**: Đảm bảo tất cả các chế độ đều đóng góp vào hệ thống SRS (Spaced Repetition).

## Thay đổi đề xuất

### 1. Giao diện (index.html)
- **Cụm chọn Level**: Xóa bỏ nút "Ôn Luyện 🚀" nằm cạnh dropdown `#level-select`.
- **Cụm nút chế độ**: Cập nhật 4 nút trong `#dynamic-mode-buttons` thành:
    1. **Trắc Nghiệm** (Icon: 📚 - `vocab-mcq`)
    2. **Gõ Pinyin** (Icon: ⌨️ - `type-pinyin`)
    3. **Tập Viết** (Icon: 🖌️ - `draw-hanzi`)
    4. **Thử Thách** (Icon: ⚡ - `vocab-challenge`)
- **Ẩn chế độ Phát âm**: Tạm thời không hiển thị nút Luyện phát âm.

### 2. Logic ứng dụng (script.js)

#### renderDynamicButtons(stats)
- Cập nhật logic tạo nút cho `currentSetupMode === 'vocab'`:
    - Lấy giá trị hiện tại của `#level-select`.
    - Tạo 4 nút với chức năng gọi `startGame(mode, selectedLevel)`.
    - **Xóa bỏ các điều kiện `disabled`** dựa trên level (ví dụ: không còn kiểm tra `stats[5] > 0`).

#### startGame(mode, levelFilter)
- Cập nhật logic lọc từ vựng (`availableWords`) cho từng chế độ:
    - **Trắc nghiệm (`vocab-mcq`)**: Lọc theo `levelFilter`.
    - **Gõ Pinyin (`type-pinyin`)**: Lọc theo `levelFilter`. Nếu là 'srs', lấy từ đến hạn.
    - **Tập Viết (`draw-hanzi`)**: Lọc theo `levelFilter`.
    - **Thử Thách (`vocab-challenge`)**: Lọc theo `levelFilter`.
- **Đồng bộ hóa**: Đảm bảo `levelFilter` được truyền chính xác từ UI vào logic khởi tạo game.

#### updateSRSProgress(hanTu, isCorrect, mode)
- Đảm bảo tất cả các mode mới (`type-pinyin`, `draw-hanzi`) đều gọi hàm này để cập nhật tiến độ.
- Giữ nguyên logic cộng điểm: Gõ/Viết được cộng nhiều điểm (boost cao) hơn Trắc nghiệm.

### 3. Kế hoạch xác minh (Verification Plan)
- **Kiểm tra mức độ**: Chọn Level 1, bấm "Gõ Pinyin", đảm bảo chỉ hiện từ Level 1.
- **Kiểm tra tính điểm**: Hoàn thành một từ trong chế độ "Tập Viết", kiểm tra xem Level của từ đó có tăng lên không.
- **Kiểm tra rào cản**: Đảm bảo người dùng mới (Level 0) vẫn có thể bấm vào "Tập Viết" mà không bị báo lỗi "Cần Level 3+".
