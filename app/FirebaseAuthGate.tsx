"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

type AdminProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "viewer";
  active: boolean;
  createdAt?: { toDate?: () => Date };
};

const authMessages: Record<string, string> = {
  "auth/invalid-credential": "Tài khoản hoặc mật khẩu không đúng.",
  "auth/email-already-in-use": "Email này đã có tài khoản.",
  "auth/weak-password": "Mật khẩu chưa đủ mạnh.",
  "auth/invalid-email": "Email không hợp lệ.",
  "auth/too-many-requests": "Bạn thử quá nhiều lần. Vui lòng đợi rồi thử lại.",
};

function messageFrom(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return authMessages[code] ?? "Không thể thực hiện. Vui lòng thử lại.";
}

export function FirebaseAuthGate({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<FirebaseApp | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAdmins, setShowAdmins] = useState(false);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "viewer">("admin");

  useEffect(() => {
    let unsubscribe = () => undefined;
    fetch("/api/firebase-config", { cache: "no-store" })
      .then((response) => response.json() as Promise<FirebaseConfig>)
      .then((config) => {
        if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
          setConfigured(false);
          setLoading(false);
          return;
        }
        const firebaseApp = getApps()[0] ?? initializeApp(config);
        setApp(firebaseApp);
        const auth = getAuth(firebaseApp);
        unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
          setUser(nextUser);
          setError("");
          if (!nextUser) {
            setProfile(null);
            setLoading(false);
            return;
          }
          try {
            const db = getFirestore(firebaseApp);
            const profileRef = doc(db, "admins", nextUser.uid);
            let snapshot = await getDoc(profileRef);
            if (!snapshot.exists()) {
              const inviteRef = doc(db, "adminInvites", nextUser.email?.toLowerCase() ?? "");
              const invite = await getDoc(inviteRef);
              if (invite.exists()) {
                await runTransaction(db, async (transaction) => {
                  const currentInvite = await transaction.get(inviteRef);
                  if (!currentInvite.exists()) throw new Error("invite-missing");
                  transaction.set(profileRef, {
                    uid: nextUser.uid,
                    email: nextUser.email?.toLowerCase(),
                    displayName: nextUser.displayName || nextUser.email?.split("@")[0] || "Quản trị viên",
                    role: currentInvite.data().role,
                    active: true,
                    createdAt: serverTimestamp(),
                  });
                  transaction.delete(inviteRef);
                });
                snapshot = await getDoc(profileRef);
              }
            }
            if (!snapshot.exists() || snapshot.data().active !== true) {
              await signOut(auth);
              setError("Tài khoản chưa được cấp quyền quản trị.");
              return;
            }
            setProfile(snapshot.data() as AdminProfile);
          } catch {
            await signOut(auth);
            setError("Tài khoản chưa được cấp quyền hoặc cấu hình Firestore chưa hoàn tất.");
          } finally {
            setLoading(false);
          }
        });
      })
      .catch(() => {
        setConfigured(false);
        setLoading(false);
      });
    return () => unsubscribe();
  }, []);

  const auth = useMemo(() => app ? getAuth(app) : null, [app]);
  const db = useMemo(() => app ? getFirestore(app) : null, [app]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth) return;
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        if (password.length < 10) throw Object.assign(new Error(), { code: "auth/weak-password" });
        const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        await updateProfile(credential.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      }
    } catch (authError) {
      setError(messageFrom(authError));
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!auth || !email.trim()) {
      setError("Nhập email trước khi yêu cầu đặt lại mật khẩu.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setNotice("Firebase đã gửi email đặt lại mật khẩu.");
    } catch (resetError) {
      setError(messageFrom(resetError));
    }
  };

  const loadAdmins = async () => {
    if (!db) return;
    const snapshot = await getDocs(query(collection(db, "admins"), orderBy("email")));
    setAdmins(snapshot.docs.map((item) => item.data() as AdminProfile));
    setShowAdmins(true);
  };

  const inviteAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (!db || !profile || profile.role === "viewer") return;
    const normalized = inviteEmail.trim().toLowerCase();
    await setDoc(doc(db, "adminInvites", normalized), {
      email: normalized,
      role: inviteRole,
      invitedBy: profile.uid,
      createdAt: serverTimestamp(),
    });
    setInviteEmail("");
    setNotice(`Đã cấp lời mời cho ${normalized}.`);
  };

  const toggleAdmin = async (admin: AdminProfile) => {
    if (!db || profile?.role !== "owner" || admin.role === "owner") return;
    await updateDoc(doc(db, "admins", admin.uid), { active: !admin.active });
    await loadAdmins();
  };

  const cancelInvite = async (targetEmail: string) => {
    if (!db || profile?.role === "viewer") return;
    await deleteDoc(doc(db, "adminInvites", targetEmail.toLowerCase()));
    setNotice(`Đã hủy lời mời ${targetEmail}.`);
  };

  if (loading) return <div className="auth-loading"><div className="auth-logo">A</div><span>Đang xác minh quyền truy cập…</span></div>;

  if (!configured) return <div className="auth-shell"><section className="auth-card setup-card"><div className="auth-logo">A</div><h1>Cần kết nối Firebase</h1><p>Ứng dụng đã sẵn sàng cho đăng nhập email/mật khẩu. Hãy thêm cấu hình Firebase Project để kích hoạt.</p><div className="setup-list"><span>1</span><p>Tạo Firebase Web App</p><span>2</span><p>Bật Email/Password và Firestore</p><span>3</span><p>Thêm 6 biến cấu hình vào website</p></div></section></div>;

  if (!user || !profile) return <div className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><div className="auth-logo">A</div><div><b>AdPilot Ops</b><small>Quản trị Ads & bán hàng</small></div></div>
    <h1>{mode === "login" ? "Đăng nhập quản trị" : "Tạo tài khoản"}</h1>
    <p>{mode === "login" ? "Dùng email và mật khẩu quản trị của bạn." : "Email cần được quản trị viên mời trước khi đăng ký."}</p>
    <form onSubmit={submit}>
      {mode === "signup" && <label>Họ và tên<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required /></label>}
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
      <label>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} required /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" type="submit">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</button>
    </form>
    {mode === "login" && <button className="auth-link" onClick={resetPassword}>Quên mật khẩu?</button>}
    <div className="auth-switch">{mode === "login" ? "Đã được mời nhưng chưa có tài khoản?" : "Đã có tài khoản?"}<button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "Đăng ký" : "Đăng nhập"}</button></div>
  </section>{notice && <div className="toast">✓ {notice}</div>}</div>;

  return <>
    {children}
    <div className="admin-session"><div className="avatar">{profile.displayName.slice(0, 2).toUpperCase()}</div><div><b>{profile.displayName}</b><small>{profile.role === "owner" ? "Chủ sở hữu" : profile.role === "admin" ? "Quản trị viên" : "Chỉ xem"}</small></div><button onClick={loadAdmins}>Quản trị viên</button><button onClick={() => auth && signOut(auth)}>Đăng xuất</button></div>
    {showAdmins && <div className="modal-backdrop" onMouseDown={() => setShowAdmins(false)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowAdmins(false)}>×</button><h2>Quản lý quản trị viên</h2><p>Cấp quyền bằng email; người được mời tự tạo mật khẩu khi đăng ký.</p>
      {profile.role !== "viewer" && <form className="invite-form" onSubmit={inviteAdmin}><input type="email" placeholder="email@congty.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required/><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "viewer")}><option value="admin">Quản trị viên</option><option value="viewer">Chỉ xem</option></select><button type="submit">Gửi lời mời</button></form>}
      <div className="admin-list">{admins.map((admin) => <article key={admin.uid}><div className="avatar">{admin.displayName.slice(0,2).toUpperCase()}</div><div><b>{admin.displayName}</b><small>{admin.email}</small></div><span className={`status ${admin.active ? "live" : "die"}`}>{admin.active ? "Đang hoạt động" : "Đã khóa"}</span>{profile.role === "owner" && admin.role !== "owner" && <button onClick={() => toggleAdmin(admin)}>{admin.active ? "Khóa" : "Mở"}</button>}</article>)}</div>
      <div className="invite-help"><b>Cách thêm người mới</b><p>Nhập email ở trên. Người đó mở AdPilot, chọn “Đăng ký” và tự đặt mật khẩu. Bạn không cần biết mật khẩu của họ.</p></div>
    </section></div>}
    {notice && <div className="toast">✓ {notice}</div>}
  </>;
}
