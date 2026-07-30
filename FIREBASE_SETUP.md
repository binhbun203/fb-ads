# Kích hoạt Firebase cho AdPilot

## 1. Tạo và cấu hình Firebase

1. Tạo Firebase Project tại https://console.firebase.google.com.
2. Project settings → Your apps → Web → Register app.
3. Authentication → Sign-in method → bật Email/Password.
4. Firestore Database → Create database → chọn Production mode.
5. Cài Firebase CLI, đăng nhập và chạy `firebase deploy --only firestore:rules`
   trong thư mục dự án để áp dụng `firestore.rules`.

## 2. Thêm cấu hình vào Sites

Thêm sáu biến môi trường sau bằng các giá trị trong `firebaseConfig` của Web App:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Đây là cấu hình nhận diện Firebase Web App, không phải mật khẩu quản trị.

## 3. Tạo chủ sở hữu đầu tiên

1. Firebase Authentication → Users → Add user, nhập email và mật khẩu đầu tiên.
2. Sao chép UID của user vừa tạo.
3. Firestore → tạo collection `admins`, document ID bằng UID.
4. Thêm các field:
   - `uid`: UID vừa sao chép (string)
   - `email`: email viết thường (string)
   - `displayName`: tên hiển thị (string)
   - `role`: `owner` (string)
   - `active`: `true` (boolean)
   - `createdAt`: timestamp hiện tại

Sau đó đăng nhập AdPilot. Chủ sở hữu có thể mời, khóa hoặc mở các quản trị viên
khác ngay trong ứng dụng. Không chia sẻ mật khẩu qua chat hoặc lưu mật khẩu vào
mã nguồn.
