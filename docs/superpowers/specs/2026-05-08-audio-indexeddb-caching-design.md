# Design Spec: Hệ thống Caching Âm thanh tự động qua IndexedDB

Ngày: 2026-05-08
Trạng thái: Chờ duyệt

## 1. Mục tiêu
Thay thế tính năng tải file âm thanh thủ công (v4.0) bằng hệ thống tự động lưu trữ (caching) vào bộ nhớ trình duyệt (IndexedDB). Đảm bảo:
- Phát âm thanh tức thì (không độ trễ mạng).
- Hỗ trợ học offline hoàn toàn sau khi đã tải dữ liệu.
- Người dùng không cần quản lý file âm thanh trên máy tính.

## 2. Kiến trúc hệ thống

### 2.1. Cơ sở dữ liệu (Storage layer)
- **Công nghệ**: IndexedDB (API chuẩn của trình duyệt).
- **Tên Database**: `VocabGameAudioDB`, phiên bản `1`.
- **Object Store**: `audio_cache`.
- **Schema**:
    - `key`: `text` (String) - Nội dung cần đọc.
    - `value`: `blob` (Blob) - Dữ liệu âm thanh thực tế.

### 2.2. Audio Management (Logic layer)
- **Hàm `initAudioDB()`**: Khởi tạo database khi ứng dụng bắt đầu.
- **Hàm `getAudioBlob(text)`**: Kiểm tra xem âm thanh đã có trong máy chưa.
- **Hàm `saveAudioBlob(text, blob)`**: Lưu file mới tải về vào máy.
- **Cập nhật `playAudio(text, lang, rate)`**:
    - Bước 1: Tìm trong IndexedDB. Nếu có -> Tạo ObjectURL và phát.
    - Bước 2: Nếu không có -> Tải từ Youdao/Google -> Lưu vào IndexedDB -> Phát.

### 2.3. Batch Downloader UI (Interface layer)
- Thêm một Modal "Trung tâm âm thanh" vào Menu chính.
- **Chức năng**:
    - `btnDownloadAll`: Duyệt qua `vocabulary` và `sentencePool` để tải và lưu mọi thứ.
    - `progressIndicator`: Hiển thị % tiến độ và số lượng file đã lưu.
    - `btnClearCache`: Xóa toàn bộ database nếu người dùng muốn giải phóng dung lượng.

## 3. Kế hoạch thay đổi mã nguồn

### 3.1. [MODIFY] `index.html`
- Thêm HTML cho Modal/Section quản lý âm thanh.
- Thêm các phần tử hiển thị tiến trình (Progress bar).

### 3.2. [MODIFY] `script.js`
- Thêm logic quản lý IndexedDB.
- Cập nhật hàm `playAudio`.
- Thêm logic tải hàng loạt (Batch download in background).

### 3.3. [DELETE] Các file script tải file thủ công (nếu có sau khi git pull)
- Loại bỏ các nút bấm hoặc kịch bản liên quan đến "Tải file .mp3 về máy".

## 4. Kế hoạch kiểm tra (Testing)
1. Kiểm tra phát âm thanh lần đầu (có mạng).
2. Kiểm tra phát âm thanh lần hai (tắt mạng) -> Phải phát được ngay.
3. Kiểm tra nút "Tải toàn bộ" với danh sách 100+ từ.
4. Kiểm tra trên cả máy tính và điện thoại (Chrome/Safari).

## 5. Tự rà soát (Self-Review)
- [x] Không có placeholder "TBD".
- [x] Kiến trúc phù hợp với ứng dụng static HTML/JS hiện tại.
- [x] Đã giải quyết vấn đề "không làm nặng/lag máy" bằng cách dùng Async/Await.
