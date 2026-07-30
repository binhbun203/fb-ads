# Kích hoạt Firebase và kết nối dữ liệu

1. Tạo Firebase Web App, bật Authentication bằng Email/Password và Firestore.
2. Thêm sáu biến `FIREBASE_*` trong `.env.example` vào môi trường Sites.
3. Áp dụng `firestore.rules` bằng Firebase CLI hoặc Firebase Console.
4. Tạo user chủ sở hữu đầu tiên trong Firebase Authentication, rồi tạo
   `admins/{UID}` trong Firestore với `role: "owner"` và `active: true`.
5. Tạo Meta App, bật Facebook Login for Business và dùng callback:
   `https://adpilot-ops-vn.bindqbin.chatgpt.site/api/integrations/facebook/callback`.
6. Thêm `META_APP_ID`, `META_APP_SECRET`, `OAUTH_STATE_SECRET` và
   `INTEGRATION_ENCRYPTION_KEY` vào môi trường Sites.
7. Với Pancake, quản trị viên tự tạo API Key trong POS tại
   Cài đặt → Kết nối bên thứ ba → Webhook/API, rồi nhập key trong AdPilot.

Không lưu mật khẩu, Meta App Secret, API Key Pancake hoặc khóa mã hóa trong mã
nguồn hay trong chat.
