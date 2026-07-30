"use client";

import { useEffect, useMemo, useState } from "react";
import { getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

const accounts = [
  { name: "Ads — Hà Nội 01", bm: "BM AURORA", spent: 8240000, yesterday: 7120000, threshold: 16000000, status: "Live", orders: 142, revenue: 28640000 },
  { name: "Ads — HCM 02", bm: "BM AURORA", spent: 6680000, yesterday: 6320000, threshold: 12000000, status: "Live", orders: 106, revenue: 20720000 },
  { name: "Ads — Scale 03", bm: "BM NORTH", spent: 4920000, yesterday: 5380000, threshold: 8000000, status: "Live", orders: 78, revenue: 14660000 },
  { name: "Ads — Test 04", bm: "BM NORTH", spent: 3160000, yesterday: 2820000, threshold: 6000000, status: "Die", orders: 40, revenue: 7240000 },
  { name: "Ads — Retarget 05", bm: "BM RETAIL", spent: 2880000, yesterday: 2540000, threshold: 6000000, status: "Live", orders: 47, revenue: 9020000 },
];

const daily = [
  { date: "29/07", ads: 25880000, bills: 22600000, revenue: 80240000, cost: 16600000 },
  { date: "28/07", ads: 24180000, bills: 18400000, revenue: 74420000, cost: 15300000 },
  { date: "27/07", ads: 22640000, bills: 24700000, revenue: 70680000, cost: 14900000 },
  { date: "26/07", ads: 21320000, bills: 16200000, revenue: 66180000, cost: 13800000 },
  { date: "25/07", ads: 19860000, bills: 21800000, revenue: 62460000, cost: 13100000 },
];

const bills = [
  { id: "FB-905842", account: "Ads — Hà Nội 01", time: "29/07 · 14:32", amount: 8200000, method: "Visa •• 4821", status: "Đã thanh toán" },
  { id: "FB-905631", account: "Ads — HCM 02", time: "29/07 · 10:18", amount: 6400000, method: "Visa •• 4821", status: "Đã thanh toán" },
  { id: "FB-905229", account: "Ads — Scale 03", time: "29/07 · 08:05", amount: 5000000, method: "Mastercard •• 0914", status: "Đã thanh toán" },
  { id: "FB-904918", account: "Ads — Test 04", time: "28/07 · 22:46", amount: 3000000, method: "Mastercard •• 0914", status: "Đã thanh toán" },
];

const products = [
  { name: "Serum phục hồi B5", sku: "SR-B5", orders: 168, revenue: 32760000, adCost: 9100000, cogs: 13440000 },
  { name: "Kem chống nắng UV50", sku: "KCN-50", orders: 112, revenue: 22960000, adCost: 6980000, cogs: 7840000 },
  { name: "Combo sáng da 30 ngày", sku: "CB-SD30", orders: 76, revenue: 20520000, adCost: 6460000, cogs: 9120000 },
];

type Tab = "Tổng quan" | "Chi tiêu Ads" | "Thanh toán" | "Ngưỡng tài khoản" | "Tình trạng TK" | "Doanh số & ROAS" | "Cost sản phẩm" | "Dữ liệu Pancake" | "Tài khoản kết nối";

const tabs: { name: Tab; icon: string }[] = [
  { name: "Tổng quan", icon: "⌂" }, { name: "Chi tiêu Ads", icon: "↗" }, { name: "Thanh toán", icon: "▣" },
  { name: "Ngưỡng tài khoản", icon: "◒" }, { name: "Tình trạng TK", icon: "●" }, { name: "Doanh số & ROAS", icon: "◇" },
  { name: "Cost sản phẩm", icon: "◎" }, { name: "Dữ liệu Pancake", icon: "≋" },
  { name: "Tài khoản kết nối", icon: "⚙" },
];

function Sparkline({ values, color = "#63d9b7" }: { values: number[]; color?: string }) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${32 - ((v - min) / (max - min || 1)) * 26}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function StatCard({ label, value, delta, tone, values }: { label: string; value: string; delta: string; tone: string; values: number[] }) {
  return <article className="stat-card">
    <div className="stat-top"><span className={`stat-icon ${tone}`}>◆</span><span className="delta">↗ {delta}</span></div>
    <p>{label}</p><strong>{value}</strong><Sparkline values={values} color={tone === "blue" ? "#7da8ff" : tone === "amber" ? "#f5b85c" : tone === "violet" ? "#a78bfa" : "#63d9b7"} />
  </article>;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("Tổng quan");
  const [fromDate, setFromDate] = useState("2026-07-23");
  const [toDate, setToDate] = useState("2026-07-29");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [connectMode, setConnectMode] = useState<"choose" | "pancake">("choose");
  const [pancakeApiKey, setPancakeApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connections, setConnections] = useState<Array<{provider:string;accountName:string;externalAccountId:string;status:string;updatedAt:number;metadata?:{shops?:Array<{id:number;name:string;pageCount:number}>}}>>([]);
  const filtered = useMemo(() => accounts.filter(a => `${a.name} ${a.bm}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const totalSpend = accounts.reduce((s, a) => s + a.spent, 0);
  const totalRevenue = accounts.reduce((s, a) => s + a.revenue, 0);
  const totalThreshold = accounts.reduce((s, a) => s + a.threshold, 0);

  const exportReport = () => {
    const rows = [["Tài khoản","BM","Chi tiêu","Doanh số","ROAS","Trạng thái"], ...accounts.map(a => [a.name,a.bm,a.spent,a.revenue,(a.revenue/a.spent).toFixed(2),a.status])];
    const blob = new Blob(["\uFEFF" + rows.map(r => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "bao-cao-ads-29-07-2026.csv"; link.click(); URL.revokeObjectURL(url);
    setNotice("Đã xuất báo cáo CSV");
    setTimeout(() => setNotice(""), 2500);
  };

  const firebaseToken = async () => {
    const app = getApps()[0];
    const user = app ? getAuth(app).currentUser : null;
    if (!user) throw new Error("Bạn cần đăng nhập quản trị trước.");
    return user.getIdToken();
  };

  const loadConnections = async () => {
    try {
      const token = await firebaseToken();
      const response = await fetch("/api/integrations/status", { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json() as { connections: typeof connections };
        setConnections(data.connections);
      }
    } catch {
      // Authentication gate will handle signed-out state.
    }
  };

  useEffect(() => {
    if (tab === "Tài khoản kết nối") loadConnections();
    const connection = new URLSearchParams(window.location.search).get("connection");
    if (connection === "facebook-success") {
      setTab("Tài khoản kết nối");
      setNotice("Đã kết nối Facebook Business thành công.");
      window.history.replaceState({}, "", "/");
    }
  }, [tab]);

  const connectFacebook = async () => {
    setConnecting(true);
    try {
      const token = await firebaseToken();
      const response = await fetch("/api/integrations/facebook/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error);
      window.location.assign(data.url);
    } catch {
      setNotice("Facebook chưa được cấu hình App ID hoặc bạn chưa đăng nhập quản trị.");
      setConnecting(false);
    }
  };

  const connectPancake = async () => {
    setConnecting(true);
    try {
      const token = await firebaseToken();
      const response = await fetch("/api/integrations/pancake/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: pancakeApiKey }),
      });
      if (!response.ok) throw new Error("invalid");
      setPancakeApiKey("");
      setShowConnect(false);
      setConnectMode("choose");
      await loadConnections();
      setNotice("Đã kết nối và xác minh Pancake POS.");
    } catch {
      setNotice("API Key Pancake không hợp lệ hoặc không có quyền truy cập shop.");
    } finally {
      setConnecting(false);
    }
  };

  return <main>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><b>AdPilot</b><small>Ops Console</small></div></div>
      <nav>{tabs.map(t => <button key={t.name} className={tab === t.name ? "active" : ""} onClick={() => setTab(t.name)}><span>{t.icon}</span>{t.name}</button>)}</nav>
      <div className="sync-card"><div><span className="pulse" /><b>Đồng bộ dữ liệu</b></div><p>Facebook Ads & Pancake</p><small>Cập nhật 2 phút trước</small><button onClick={() => { setNotice("Đã đồng bộ dữ liệu mới nhất"); setTimeout(() => setNotice(""), 2500); }}>↻ Đồng bộ ngay</button></div>
      <div className="profile"><div className="avatar">QT</div><div><b>Quản trị viên</b><small>admin@adpilot.vn</small></div><span>•••</span></div>
    </aside>

    <section className="content">
      <header><div><h1>{tab}</h1><p>Dữ liệu vận hành Ads & bán hàng · {fromDate.split("-").reverse().join("/")} — {toDate.split("-").reverse().join("/")}</p></div><div className="actions"><div className="date-range"><span>◷</span><label>Từ ngày<input aria-label="Từ ngày" type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} /></label><i>→</i><label>Đến ngày<input aria-label="Đến ngày" type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} /></label><button onClick={()=>setNotice(`Đã áp dụng dữ liệu từ ${fromDate.split("-").reverse().join("/")} đến ${toDate.split("-").reverse().join("/")}`)}>Áp dụng</button></div><button className="export" onClick={exportReport}>⇩ Xuất báo cáo</button></div></header>

      {tab === "Tổng quan" && <>
        <div className="stats">
          <StatCard label="Chi tiêu quảng cáo" value={money(totalSpend)} delta="7,2%" tone="blue" values={[18,22,20,25,23,29,32]} />
          <StatCard label="Doanh thu thuần" value={money(totalRevenue)} delta="12,8%" tone="green" values={[20,18,23,26,25,31,35]} />
          <StatCard label="ROAS tổng" value={(totalRevenue/totalSpend).toFixed(2)} delta="0,14" tone="violet" values={[18,20,21,22,24,27,28]} />
          <StatCard label="Bill đã thanh toán" value={money(22600000)} delta="4 bill" tone="amber" values={[12,18,15,23,19,29,25]} />
        </div>
        <div className="grid-main">
          <section className="panel performance"><div className="panel-head"><div><h2>Hiệu suất 7 ngày</h2><p>Chi tiêu so với doanh thu</p></div><div className="legend"><span className="blue-dot"/>Chi tiêu <span className="green-dot"/>Doanh thu</div></div>
            <div className="chart"><div className="ylabels"><span>100tr</span><span>75tr</span><span>50tr</span><span>25tr</span><span>0</span></div><div className="bars">{daily.slice().reverse().concat(daily.slice(0,2)).map((d,i)=><div className="bar-col" key={i}><div className="bar-pair"><i style={{height:`${d.ads/1100000}px`}}/><b style={{height:`${d.revenue/1100000}px`}}/></div><span>{i+23}/07</span></div>)}</div></div>
          </section>
          <section className="panel health"><div className="panel-head"><div><h2>Tình trạng tài khoản</h2><p>5 tài khoản quảng cáo</p></div><button onClick={()=>setTab("Tình trạng TK")}>Xem chi tiết →</button></div>
            <div className="donut-wrap"><div className="donut"><div><b>80%</b><small>Đang live</small></div></div><div className="health-nums"><p><span><i className="live"/>Live</span><b>4</b></p><p><span><i className="dead"/>Die</span><b>1</b></p><p><span><i className="review"/>Xét duyệt</span><b>0</b></p></div></div>
          </section>
        </div>
        <section className="panel account-table"><div className="panel-head"><div><h2>Hiệu suất theo tài khoản</h2><p>Cập nhật theo thời gian thực</p></div><label className="search">⌕<input aria-label="Tìm tài khoản" placeholder="Tìm tài khoản, BM..." value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
          <AccountTable rows={filtered} mode="performance" />
        </section>
      </>}

      {tab === "Chi tiêu Ads" && <DetailPage title="Chi tiêu quảng cáo theo tài khoản" subtitle="Đối chiếu ngân sách Facebook Ads theo ngày và BM">
        <div className="mini-stats"><Mini label="Tổng hôm nay" value={money(totalSpend)}/><Mini label="So với hôm qua" value="+7,2%" accent/><Mini label="BM đang chạy" value="3"/><Mini label="Tài khoản hoạt động" value="4 / 5"/></div>
        <AccountTable rows={filtered} mode="spend" />
        <DailyTable />
      </DetailPage>}

      {tab === "Thanh toán" && <DetailPage title="Bill & thanh toán" subtitle="Kiểm soát hóa đơn đã thanh toán theo ngày và tháng">
        <div className="mini-stats"><Mini label="Đã thanh toán hôm nay" value={money(22600000)}/><Mini label="Tháng 7 / 2026" value={money(286400000)}/><Mini label="Số bill trong ngày" value="4"/><Mini label="Bill chờ xử lý" value="0" accent/></div>
        <div className="table-wrap"><table><thead><tr><th>MÃ BILL</th><th>TÀI KHOẢN</th><th>THỜI GIAN</th><th>PHƯƠNG THỨC</th><th>SỐ TIỀN</th><th>TRẠNG THÁI</th></tr></thead><tbody>{bills.map(b=><tr key={b.id}><td><b>{b.id}</b></td><td>{b.account}</td><td>{b.time}</td><td>{b.method}</td><td><b>{money(b.amount)}</b></td><td><span className="status live">✓ {b.status}</span></td></tr>)}</tbody></table></div>
      </DetailPage>}

      {tab === "Ngưỡng tài khoản" && <DetailPage title="Ngưỡng thanh toán" subtitle="Theo dõi hạn mức và số ngưỡng còn lại của từng tài khoản">
        <div className="mini-stats"><Mini label="Tổng ngưỡng" value={money(totalThreshold)}/><Mini label="Đã sử dụng" value={money(totalSpend)}/><Mini label="Ngưỡng còn lại" value={money(totalThreshold-totalSpend)} accent/><Mini label="Sắp chạm ngưỡng" value="2 tài khoản"/></div>
        <div className="threshold-grid">{accounts.map(a=>{const pc=Math.round(a.spent/a.threshold*100); return <article className="threshold-card" key={a.name}><div><span className="account-icon">f</span><span><b>{a.name}</b><small>{a.bm}</small></span><em>{pc}%</em></div><p><span>Đã dùng {money(a.spent)}</span><span>{money(a.threshold)}</span></p><div className="progress"><i style={{width:`${Math.min(pc,100)}%`}} className={pc>70?"warn":""}/></div><footer>Còn lại <b>{money(a.threshold-a.spent)}</b></footer></article>})}</div>
      </DetailPage>}

      {tab === "Tình trạng TK" && <DetailPage title="Sức khỏe tài khoản" subtitle="Tổng kết tài khoản live, die và trạng thái phân phối">
        <div className="mini-stats"><Mini label="Tổng tài khoản" value="5"/><Mini label="Đang live" value="4" accent/><Mini label="Đã die" value="1"/><Mini label="Tỷ lệ hoạt động" value="80%"/></div>
        <AccountTable rows={accounts} mode="status" />
      </DetailPage>}

      {tab === "Doanh số & ROAS" && <DetailPage title="Doanh số & ROAS" subtitle="Dữ liệu chốt đơn từ POS Pancake theo tài khoản và sản phẩm">
        <div className="mini-stats"><Mini label="Doanh thu hôm nay" value={money(totalRevenue)}/><Mini label="Đơn đã chốt" value="413" accent/><Mini label="ROAS tổng" value={(totalRevenue/totalSpend).toFixed(2)}/><Mini label="Doanh thu tháng 7" value={money(2186400000)}/></div>
        <div className="split-tables"><ProductTable/><AccountTable rows={accounts} mode="roas"/></div>
      </DetailPage>}

      {tab === "Cost sản phẩm" && <DetailPage title="Cost sản phẩm đã gửi" subtitle="Theo dõi giá vốn của các đơn đã gửi theo ngày">
        <div className="mini-stats"><Mini label="Tổng cost hôm nay" value={money(30360000)}/><Mini label="Sản phẩm đã gửi" value="356"/><Mini label="Cost / đơn TB" value={money(85280)} accent/><Mini label="Tỷ lệ hoàn" value="6,4%"/></div>
        <div className="table-wrap"><table><thead><tr><th>SẢN PHẨM</th><th>SKU</th><th>ĐƠN ĐÃ GỬI</th><th>GIÁ VỐN / SP</th><th>TỔNG COST</th><th>TỶ TRỌNG</th></tr></thead><tbody>{products.map(p=><tr key={p.sku}><td><b>{p.name}</b></td><td>{p.sku}</td><td>{p.orders}</td><td>{money(p.cogs/p.orders)}</td><td><b>{money(p.cogs)}</b></td><td><div className="inline-progress"><i style={{width:`${p.cogs/160000}%`}}/></div></td></tr>)}</tbody></table></div>
      </DetailPage>}

      {tab === "Dữ liệu Pancake" && <DetailPage title="Dữ liệu Pancake POS" subtitle="Tổng hợp tình trạng đơn hàng, doanh thu và vận chuyển">
        <div className="sync-banner"><span className="pancake">P</span><div><b>Pancake POS đang kết nối</b><p>Lần đồng bộ gần nhất: 14:42 · 29/07/2026</p></div><span className="status live">● Hoạt động</span><button onClick={()=>setNotice("Đã làm mới 1.284 bản ghi")}>↻ Làm mới dữ liệu</button></div>
        <div className="mini-stats"><Mini label="Đơn mới" value="486"/><Mini label="Đã xác nhận" value="413" accent/><Mini label="Đang giao" value="356"/><Mini label="Hoàn / hủy" value="31"/></div>
        <DailyTable />
      </DetailPage>}
      {tab === "Tài khoản kết nối" && <DetailPage title="Tài khoản kết nối" subtitle="Đăng nhập, xác minh và quản lý các nguồn dữ liệu đang đồng bộ">
        <div className="connection-summary">
          <div><span className="pulse"/><b>{connections.length} nguồn dữ liệu đã kết nối</b><p>Quyền truy cập được kiểm tra định kỳ</p></div>
          <button className="connect-primary" onClick={()=>setShowConnect(true)}>＋ Kết nối tài khoản</button>
        </div>
        <div className="mini-stats"><Mini label="Nguồn đã đăng nhập" value={String(connections.length)} accent/><Mini label="Facebook Business" value={connections.some(item=>item.provider==="facebook")?"Đã kết nối":"Chưa kết nối"}/><Mini label="Pancake POS" value={connections.some(item=>item.provider==="pancake")?"Đã kết nối":"Chưa kết nối"}/><Mini label="Cần xác minh lại" value={String(connections.filter(item=>item.status!=="active").length)}/></div>
        <section className="panel connected-table">
          <div className="panel-head"><div><h2>Bảng tài khoản đã đăng nhập</h2><p>Danh tính, quyền truy cập và lần xác minh gần nhất</p></div><button className="verify-all" onClick={loadConnections}>↻ Làm mới</button></div>
          <div className="table-wrap"><table><thead><tr><th>NỀN TẢNG</th><th>TÀI KHOẢN ĐĂNG NHẬP</th><th>QUYỀN TRUY CẬP</th><th>TÀI SẢN</th><th>XÁC MINH GẦN NHẤT</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>
            {connections.map(item=><tr key={item.provider}><td><div className="platform"><span className={item.provider==="facebook"?"account-icon":"pancake small"}>{item.provider==="facebook"?"f":"P"}</span><b>{item.provider==="facebook"?"Meta Business":"Pancake POS"}</b></div></td><td><b>{item.accountName}</b><small className="sku">ID: {item.externalAccountId}</small></td><td>{item.provider==="facebook"?"Ads read · Business read":"Đơn hàng · Sản phẩm · POS"}</td><td>{item.provider==="pancake"?`${item.metadata?.shops?.length??1} shop`:"BM và tài khoản Ads"}</td><td>{new Date(item.updatedAt).toLocaleString("vi-VN")}</td><td><span className={`status ${item.status==="active"?"live":"die"}`}>● {item.status==="active"?"Đã xác minh":"Cần xác minh"}</span></td><td><button className="row-action" onClick={loadConnections}>Kiểm tra</button></td></tr>)}
            {!connections.length&&<tr><td colSpan={7}><div className="empty-connections">Chưa có nguồn dữ liệu nào. Nhấn “Kết nối tài khoản” để bắt đầu.</div></td></tr>}
          </tbody></table></div>
        </section>
        <div className="security-note"><span>⌾</span><div><b>Kết nối an toàn bằng OAuth</b><p>Mật khẩu không được lưu trên AdPilot. Bạn có thể thu hồi quyền truy cập bất cứ lúc nào từ Meta hoặc Pancake.</p></div></div>
      </DetailPage>}
      <footer className="page-footer"><span>AdPilot Ops · Dữ liệu mẫu minh họa</span><span><i className="live-dot"/> Hệ thống hoạt động bình thường</span></footer>
    </section>
    {showConnect && <div className="modal-backdrop" onMouseDown={()=>{setShowConnect(false);setConnectMode("choose")}}><section className="connect-modal" role="dialog" aria-modal="true" aria-label="Kết nối tài khoản" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" aria-label="Đóng" onClick={()=>{setShowConnect(false);setConnectMode("choose")}}>×</button><h2>{connectMode==="choose"?"Kết nối nguồn dữ liệu":"Kết nối Pancake POS"}</h2><p>{connectMode==="choose"?"Chọn tài khoản bạn muốn đăng nhập và cấp quyền đọc báo cáo.":"Tạo API Key trong Pancake POS rồi dán vào bên dưới. Không nhập mật khẩu Pancake."}</p>{connectMode==="choose"?<div className="provider-list">
      <button disabled={connecting} onClick={connectFacebook}><span className="account-icon large">f</span><span><b>Đăng nhập bằng Facebook</b><small>Kết nối Business Manager và tài khoản quảng cáo</small></span><em>→</em></button>
      <button onClick={()=>setConnectMode("pancake")}><span className="pancake">P</span><span><b>Kết nối Pancake POS</b><small>Đồng bộ shop, pages, đơn hàng và sản phẩm</small></span><em>→</em></button>
    </div>:<div className="pancake-key-form"><label>API Key Pancake<input type="password" autoComplete="off" value={pancakeApiKey} onChange={e=>setPancakeApiKey(e.target.value)} placeholder="Dán API Key tại đây"/></label><small>Pancake POS → Cài đặt → Kết nối bên thứ ba → Webhook/API → Tạo API Key.</small><div><button onClick={()=>setConnectMode("choose")}>Quay lại</button><button disabled={connecting||pancakeApiKey.length<12} onClick={connectPancake}>{connecting?"Đang xác minh…":"Kết nối & đồng bộ"}</button></div></div>}<div className="oauth-info">{connectMode==="choose"?"Facebook sẽ mở trang cấp quyền chính thức. AdPilot không nhìn thấy mật khẩu Facebook của bạn.":"API Key được mã hóa AES-GCM và chỉ lưu ở máy chủ."}</div></section></div>}
    {notice && <div className="toast">✓ {notice}</div>}
  </main>;
}

function DetailPage({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) {
  return <div className="detail-page"><section className="detail-title"><div><h2>{title}</h2><p>{subtitle}</p></div><div className="filter-chips"><button className="selected">Tất cả BM</button><button>BM AURORA</button><button>BM NORTH</button></div></section>{children}</div>;
}
function Mini({label,value,accent=false}:{label:string;value:string;accent?:boolean}) { return <article className={`mini ${accent?"accent":""}`}><p>{label}</p><b>{value}</b></article> }
function AccountTable({rows,mode}:{rows:typeof accounts;mode:string}) { return <div className="table-wrap"><table><thead><tr><th>TÀI KHOẢN</th><th>BUSINESS MANAGER</th><th>{mode==="status"?"TRẠNG THÁI":"CHI TIÊU HÔM NAY"}</th><th>{mode==="spend"?"HÔM QUA":"DOANH THU"}</th><th>{mode==="status"?"PHÂN PHỐI":"ROAS"}</th><th>TRẠNG THÁI</th></tr></thead><tbody>{rows.map(a=><tr key={a.name}><td><div className="account"><span className="account-icon">f</span><b>{a.name}</b></div></td><td>{a.bm}</td><td>{mode==="status"?<span className={`status ${a.status==="Live"?"live":"die"}`}>● {a.status}</span>:<b>{money(a.spent)}</b>}</td><td>{mode==="spend"?money(a.yesterday):money(a.revenue)}</td><td>{mode==="status"?(a.status==="Live"?"Bình thường":"Đã dừng"):<span className="roas">{(a.revenue/a.spent).toFixed(2)}</span>}</td><td><span className={`status ${a.status==="Live"?"live":"die"}`}>● {a.status}</span></td></tr>)}</tbody></table></div> }
function DailyTable(){return <section className="panel daily"><div className="panel-head"><div><h2>Tổng hợp theo ngày</h2><p>5 ngày gần nhất</p></div></div><div className="table-wrap"><table><thead><tr><th>NGÀY</th><th>CHI TIÊU ADS</th><th>BILL ĐÃ TRẢ</th><th>DOANH THU POS</th><th>COST ĐÃ GỬI</th><th>ROAS</th></tr></thead><tbody>{daily.map(d=><tr key={d.date}><td><b>{d.date}/2026</b></td><td>{money(d.ads)}</td><td>{money(d.bills)}</td><td><b>{money(d.revenue)}</b></td><td>{money(d.cost)}</td><td><span className="roas">{(d.revenue/d.ads).toFixed(2)}</span></td></tr>)}</tbody></table></div></section>}
function ProductTable(){return <section className="panel product-table"><div className="panel-head"><div><h2>Theo sản phẩm</h2><p>Doanh số chốt hôm nay</p></div></div><div className="table-wrap"><table><thead><tr><th>SẢN PHẨM</th><th>ĐƠN</th><th>DOANH THU</th><th>ROAS</th></tr></thead><tbody>{products.map(p=><tr key={p.sku}><td><b>{p.name}</b><small className="sku">{p.sku}</small></td><td>{p.orders}</td><td>{money(p.revenue)}</td><td><span className="roas">{(p.revenue/p.adCost).toFixed(2)}</span></td></tr>)}</tbody></table></div></section>}
