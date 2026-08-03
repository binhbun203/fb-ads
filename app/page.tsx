"use client";

import { useEffect, useMemo, useState } from "react";
import { getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

type AccountRow = {
  id: string;
  name: string;
  bm: string;
  spent: number;
  yesterday: number;
  threshold: number;
  status: "Live" | "Die";
  orders: number;
  revenue: number;
};

type DailyRow = {
  date: string;
  ads: number;
  bills: number;
  revenue: number;
  cost: number;
};

type Tab = "Tổng quan" | "Chi tiêu Ads" | "Thanh toán" | "Ngưỡng tài khoản" | "Tình trạng TK" | "Doanh số & ROAS" | "Cost sản phẩm" | "Dữ liệu Pancake" | "Tài khoản kết nối";

type Connection = {
  provider: string;
  accountName: string;
  externalAccountId: string;
  status: string;
  updatedAt: number;
  metadata?: {
    shops?: Array<{ id: number; name: string; pageCount: number }>;
    businesses?: Array<{ id: string; name: string }>;
    adAccounts?: Array<{
      id: string;
      account_id?: string;
      name?: string;
      account_status?: number;
      currency?: string;
      amount_spent?: string;
      balance?: string;
      spend_cap?: string;
      business?: { id?: string; name?: string };
      periodSpend?: number;
      dailySpend?: Array<{ date: string; spend: number; impressions: number; clicks: number }>;
    }>;
    reportRange?: { from: string; to: string };
    summary?: { orderCount: number; revenue: number; cancelledCount: number };
    daily?: Array<{ date: string; orders: number; revenue: number; cost: number; cancelled: number }>;
    products?: Array<{ name: string; sku: string; orders: number; revenue: number; cost: number }>;
    lastSyncedAt?: number;
  };
};

const tabs: { name: Tab; icon: string }[] = [
  { name: "Tổng quan", icon: "⌂" }, { name: "Chi tiêu Ads", icon: "↗" }, { name: "Thanh toán", icon: "▣" },
  { name: "Ngưỡng tài khoản", icon: "◒" }, { name: "Tình trạng TK", icon: "●" }, { name: "Doanh số & ROAS", icon: "◇" },
  { name: "Cost sản phẩm", icon: "◎" }, { name: "Dữ liệu Pancake", icon: "≋" },
  { name: "Tài khoản kết nối", icon: "⚙" },
];

function Sparkline({ values, color = "#63d9b7" }: { values: number[]; color?: string }) {
  const max = Math.max(...values), min = Math.min(...values);
  const chartValues = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const pts = chartValues.map((v, i) => `${(i / (chartValues.length - 1)) * 100},${32 - ((v - min) / (max - min || 1)) * 26}`).join(" ");
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
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [connectMode, setConnectMode] = useState<"choose" | "facebook" | "pancake">("choose");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [pancakeApiKey, setPancakeApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const facebook = connections.find(item => item.provider === "facebook");
  const pancake = connections.find(item => item.provider === "pancake");
  const accounts = useMemo<AccountRow[]>(() => (facebook?.metadata?.adAccounts ?? []).map(account => {
    const dailySpend = account.dailySpend ?? [];
    const previousDaySpend = dailySpend.length > 1 ? dailySpend[dailySpend.length - 2].spend : 0;
    return {
      id: account.id,
      name: account.name || `Tài khoản ${account.account_id || account.id}`,
      bm: account.business?.name || "Không thuộc BM",
      spent: Number(account.periodSpend ?? 0),
      yesterday: previousDaySpend,
      threshold: Number(account.spend_cap ?? 0),
      status: account.account_status === 1 ? "Live" : "Die",
      orders: 0,
      revenue: 0,
    };
  }), [facebook]);
  const daily = useMemo<DailyRow[]>(() => {
    const totals = new Map<string, DailyRow>();
    for (const account of facebook?.metadata?.adAccounts ?? []) {
      for (const row of account.dailySpend ?? []) {
        const value = totals.get(row.date) ?? { date: row.date, ads: 0, bills: 0, revenue: 0, cost: 0 };
        value.ads += row.spend;
        totals.set(row.date, value);
      }
    }
    for (const row of pancake?.metadata?.daily ?? []) {
      const value = totals.get(row.date) ?? { date: row.date, ads: 0, bills: 0, revenue: 0, cost: 0 };
      value.revenue += Number(row.revenue ?? 0);
      value.cost += Number(row.cost ?? 0);
      totals.set(row.date, value);
    }
    return [...totals.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [facebook, pancake]);
  const products = pancake?.metadata?.products ?? [];
  const filtered = useMemo(() => accounts.filter(a => `${a.name} ${a.bm}`.toLowerCase().includes(query.toLowerCase())), [accounts, query]);
  const totalSpend = accounts.reduce((s, a) => s + a.spent, 0);
  const totalRevenue = Number(pancake?.metadata?.summary?.revenue ?? 0);
  const totalOrders = Number(pancake?.metadata?.summary?.orderCount ?? 0);
  const totalCancelled = Number(pancake?.metadata?.summary?.cancelledCount ?? 0);
  const totalCost = products.reduce((sum, product) => sum + Number(product.cost ?? 0), 0);
  const totalThreshold = accounts.reduce((s, a) => s + a.threshold, 0);
  const liveCount = accounts.filter(a => a.status === "Live").length;
  const dieCount = accounts.length - liveCount;

  const exportReport = () => {
    const rows = [["Tài khoản","BM","Chi tiêu","Doanh số","ROAS","Trạng thái"], ...accounts.map(a => [a.name,a.bm,a.spent,a.revenue,a.spent ? (a.revenue/a.spent).toFixed(2) : "0.00",a.status])];
    const blob = new Blob(["\uFEFF" + rows.map(r => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `bao-cao-ads-${fromDate}-${toDate}.csv`; link.click(); URL.revokeObjectURL(url);
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

  const syncFacebookAssets = async (silent = false) => {
    setSyncing(true);
    try {
      const token = await firebaseToken();
      const response = await fetch("/api/integrations/facebook/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      });
      const data = await response.json() as {
        businessCount?: number;
        adAccountCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error);
      await loadConnections();
      if (!silent) {
        setNotice(`Đã đồng bộ ${data.businessCount ?? 0} BM và ${data.adAccountCount ?? 0} tài khoản quảng cáo.`);
      }
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "unknown";
      if (!silent) {
        setNotice(`Không thể đồng bộ Meta (${code}). Hãy kết nối lại Facebook nếu quyền đã hết hạn.`);
      }
    } finally {
      setSyncing(false);
    }
  };

  const hasFacebookConnection = connections.some(item => item.provider === "facebook");
  const hasPancakeConnection = connections.some(item => item.provider === "pancake");

  const syncPancakeData = async (silent = false) => {
    setSyncing(true);
    try {
      const token = await firebaseToken();
      const response = await fetch("/api/integrations/pancake/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      });
      const data = await response.json() as { orderCount?: number; revenue?: number; error?: string };
      if (!response.ok) throw new Error(data.error);
      await loadConnections();
      if (!silent) setNotice(`Đã đồng bộ ${data.orderCount ?? 0} đơn Pancake, doanh thu ${money(data.revenue ?? 0)}.`);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "unknown";
      if (!silent) setNotice(`Không thể đồng bộ Pancake (${code}). Hãy kiểm tra lại API Key và quyền xem đơn hàng.`);
    } finally {
      setSyncing(false);
    }
  };

  const syncAll = async (silent = false) => {
    const jobs: Promise<void>[] = [];
    if (hasFacebookConnection) jobs.push(syncFacebookAssets(true));
    if (hasPancakeConnection) jobs.push(syncPancakeData(true));
    await Promise.all(jobs);
    await loadConnections();
    if (!silent) setNotice("Đã đồng bộ dữ liệu mới nhất từ Meta và Pancake.");
  };

  useEffect(() => {
    if (!hasFacebookConnection && !hasPancakeConnection) return;
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncAll(true);
    };
    syncWhenVisible();
    const timer = window.setInterval(syncWhenVisible, 60_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [hasFacebookConnection, hasPancakeConnection, fromDate, toDate]);

  useEffect(() => {
    void loadConnections();
    const connection = new URLSearchParams(window.location.search).get("connection");
    if (connection === "facebook-success") {
      setTab("Tài khoản kết nối");
      setNotice("Đã kết nối Facebook Business thành công.");
      window.history.replaceState({}, "", "/");
    }
  }, []);

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

  const configureFacebook = async () => {
    setConnecting(true);
    try {
      const token = await firebaseToken();
      const response = await fetch("/api/integrations/facebook/configure", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ appSecret: metaAppSecret }),
      });
      if (!response.ok) throw new Error("invalid");
      setMetaAppSecret("");
      await connectFacebook();
    } catch {
      setNotice("Chỉ tài khoản Owner được lưu Meta App Secret. Hãy kiểm tra lại khóa và quyền quản trị.");
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
      <div className="sync-card"><div><span className="pulse" /><b>Đồng bộ gần thời gian thực</b></div><p>Meta & Pancake · tự động mỗi 60 giây</p><small>{facebook?.metadata?.lastSyncedAt || pancake?.metadata?.lastSyncedAt ? `Mới nhất: ${new Date(Math.max(facebook?.metadata?.lastSyncedAt??0,pancake?.metadata?.lastSyncedAt??0)).toLocaleString("vi-VN")}` : "Chưa có lần đồng bộ dữ liệu"}</small><button disabled={syncing} onClick={()=>syncAll(false)}>↻ {syncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}</button></div>
      <div className="profile"><div className="avatar">QT</div><div><b>Quản trị viên</b><small>admin@adpilot.vn</small></div><span>•••</span></div>
    </aside>

    <section className="content">
      <header><div><h1>{tab}</h1><p>Dữ liệu vận hành Ads & bán hàng · {fromDate.split("-").reverse().join("/")} — {toDate.split("-").reverse().join("/")}</p></div><div className="actions"><div className="date-range"><span>◷</span><label>Từ ngày<input aria-label="Từ ngày" type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} /></label><i>→</i><label>Đến ngày<input aria-label="Đến ngày" type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} /></label><button disabled={syncing} onClick={()=>syncAll(false)}>{syncing ? "Đang tải…" : "Áp dụng"}</button></div><button className="export" onClick={exportReport}>⇩ Xuất báo cáo</button></div></header>

      {tab === "Tổng quan" && <>
        <div className="stats">
          <StatCard label="Chi tiêu quảng cáo" value={money(totalSpend)} delta="Meta" tone="blue" values={daily.length ? daily.slice(0,7).reverse().map(d=>d.ads) : [0]} />
          <StatCard label="Doanh thu thuần" value={money(totalRevenue)} delta="Pancake" tone="green" values={[0]} />
          <StatCard label="ROAS tổng" value={totalSpend ? (totalRevenue/totalSpend).toFixed(2) : "0.00"} delta="Dữ liệu thật" tone="violet" values={[0]} />
          <StatCard label="Bill đã thanh toán" value={money(0)} delta="Chưa có dữ liệu" tone="amber" values={[0]} />
        </div>
        <div className="grid-main">
          <section className="panel performance"><div className="panel-head"><div><h2>Hiệu suất 7 ngày</h2><p>Chi tiêu so với doanh thu</p></div><div className="legend"><span className="blue-dot"/>Chi tiêu <span className="green-dot"/>Doanh thu</div></div>
            <div className="chart"><div className="ylabels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div className="bars">{daily.slice(0,7).reverse().map((d,i)=><div className="bar-col" key={d.date}><div className="bar-pair"><i style={{height:`${Math.max(2, d.ads / Math.max(...daily.map(row=>row.ads),1) * 85)}px`}}/><b style={{height:"2px"}}/></div><span>{d.date.slice(5).split("-").reverse().join("/")}</span></div>)}</div></div>
          </section>
          <section className="panel health"><div className="panel-head"><div><h2>Tình trạng tài khoản</h2><p>{accounts.length} tài khoản quảng cáo</p></div><button onClick={()=>setTab("Tình trạng TK")}>Xem chi tiết →</button></div>
            <div className="donut-wrap"><div className="donut"><div><b>{accounts.length ? Math.round(liveCount/accounts.length*100) : 0}%</b><small>Đang live</small></div></div><div className="health-nums"><p><span><i className="live"/>Live</span><b>{liveCount}</b></p><p><span><i className="dead"/>Die</span><b>{dieCount}</b></p><p><span><i className="review"/>Xét duyệt</span><b>0</b></p></div></div>
          </section>
        </div>
        <section className="panel account-table"><div className="panel-head"><div><h2>Hiệu suất theo tài khoản</h2><p>Cập nhật theo thời gian thực</p></div><label className="search">⌕<input aria-label="Tìm tài khoản" placeholder="Tìm tài khoản, BM..." value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
          <AccountTable rows={filtered} mode="performance" />
        </section>
      </>}

      {tab === "Chi tiêu Ads" && <DetailPage title="Chi tiêu quảng cáo theo tài khoản" subtitle="Đối chiếu ngân sách Facebook Ads theo ngày và BM">
        <div className="mini-stats"><Mini label="Chi tiêu trong kỳ" value={money(totalSpend)}/><Mini label="Nguồn dữ liệu" value="Meta Ads" accent/><Mini label="BM đang chạy" value={String(new Set(accounts.map(a=>a.bm)).size)}/><Mini label="Tài khoản hoạt động" value={`${liveCount} / ${accounts.length}`}/></div>
        <AccountTable rows={filtered} mode="spend" />
        <DailyTable rows={daily} />
      </DetailPage>}

      {tab === "Thanh toán" && <DetailPage title="Bill & thanh toán" subtitle="Kiểm soát hóa đơn đã thanh toán theo ngày và tháng">
        <div className="mini-stats"><Mini label="Đã thanh toán trong kỳ" value={money(0)}/><Mini label="Dữ liệu bill" value="Chưa đồng bộ"/><Mini label="Số bill" value="0"/><Mini label="Bill chờ xử lý" value="0" accent/></div>
        <EmptyData message="Meta Marketing API không cung cấp lịch sử giao dịch thanh toán cho kết nối hiện tại." />
      </DetailPage>}

      {tab === "Ngưỡng tài khoản" && <DetailPage title="Ngưỡng thanh toán" subtitle="Theo dõi hạn mức và số ngưỡng còn lại của từng tài khoản">
        <div className="mini-stats"><Mini label="Tổng ngưỡng" value={money(totalThreshold)}/><Mini label="Chi tiêu trong kỳ" value={money(totalSpend)}/><Mini label="Ngưỡng còn lại" value={money(Math.max(0,totalThreshold-totalSpend))} accent/><Mini label="Có dữ liệu ngưỡng" value={String(accounts.filter(a=>a.threshold>0).length)}/></div>
        <div className="threshold-grid">{accounts.filter(a=>a.threshold>0).map(a=>{const pc=Math.round(a.spent/a.threshold*100); return <article className="threshold-card" key={a.id}><div><span className="account-icon">f</span><span><b>{a.name}</b><small>{a.bm}</small></span><em>{pc}%</em></div><p><span>Đã dùng {money(a.spent)}</span><span>{money(a.threshold)}</span></p><div className="progress"><i style={{width:`${Math.min(pc,100)}%`}} className={pc>70?"warn":""}/></div><footer>Còn lại <b>{money(Math.max(0,a.threshold-a.spent))}</b></footer></article>})}</div>
        {!accounts.some(a=>a.threshold>0)&&<EmptyData message="Các tài khoản Meta hiện không trả về ngưỡng chi tiêu."/>}
      </DetailPage>}

      {tab === "Tình trạng TK" && <DetailPage title="Sức khỏe tài khoản" subtitle="Tổng kết tài khoản live, die và trạng thái phân phối">
        <div className="mini-stats"><Mini label="Tổng tài khoản" value={String(accounts.length)}/><Mini label="Đang live" value={String(liveCount)} accent/><Mini label="Không hoạt động" value={String(dieCount)}/><Mini label="Tỷ lệ hoạt động" value={`${accounts.length ? Math.round(liveCount/accounts.length*100) : 0}%`}/></div>
        <AccountTable rows={accounts} mode="status" />
      </DetailPage>}

      {tab === "Doanh số & ROAS" && <DetailPage title="Doanh số & ROAS" subtitle="Dữ liệu chốt đơn từ POS Pancake theo tài khoản và sản phẩm">
        <div className="mini-stats"><Mini label="Doanh thu trong kỳ" value={money(totalRevenue)}/><Mini label="Đơn trong kỳ" value={String(totalOrders)} accent/><Mini label="ROAS tổng" value={totalSpend ? (totalRevenue/totalSpend).toFixed(2) : "0.00"}/><Mini label="Hoàn / hủy" value={String(totalCancelled)}/></div>
        <div className="split-tables"><ProductTable rows={products}/><EmptyData message="ROAS theo từng tài khoản cần dữ liệu gắn nguồn quảng cáo từ đơn Pancake. ROAS tổng và theo sản phẩm hiện dùng tổng chi tiêu Meta trong kỳ."/></div>
      </DetailPage>}

      {tab === "Cost sản phẩm" && <DetailPage title="Cost sản phẩm đã gửi" subtitle="Theo dõi giá vốn của các đơn đã gửi theo ngày">
        <div className="mini-stats"><Mini label="Tổng cost trong kỳ" value={money(totalCost)}/><Mini label="Sản phẩm trong đơn" value={String(products.reduce((sum,p)=>sum+p.orders,0))}/><Mini label="Cost / đơn TB" value={money(totalOrders ? totalCost/totalOrders : 0)} accent/><Mini label="Hoàn / hủy" value={String(totalCancelled)}/></div>
        <ProductCostTable rows={products} />
      </DetailPage>}

      {tab === "Dữ liệu Pancake" && <DetailPage title="Dữ liệu Pancake POS" subtitle="Tổng hợp tình trạng đơn hàng, doanh thu và vận chuyển">
        <div className="sync-banner"><span className="pancake">P</span><div><b>Pancake POS {hasPancakeConnection ? "đã kết nối" : "chưa kết nối"}</b><p>{pancake?.metadata?.lastSyncedAt ? `Đồng bộ: ${new Date(pancake.metadata.lastSyncedAt).toLocaleString("vi-VN")}` : "Chưa đồng bộ đơn hàng"}</p></div><span className={`status ${hasPancakeConnection?"live":"die"}`}>● {hasPancakeConnection?"Hoạt động":"Chưa kết nối"}</span><button disabled={syncing} onClick={()=>syncPancakeData(false)}>↻ Đồng bộ đơn hàng</button></div>
        <div className="mini-stats"><Mini label="Đơn trong kỳ" value={String(totalOrders)}/><Mini label="Doanh thu" value={money(totalRevenue)} accent/><Mini label="Giá vốn" value={money(totalCost)}/><Mini label="Hoàn / hủy" value={String(totalCancelled)}/></div>
        <DailyTable rows={daily} />
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
            {connections.map(item=><tr key={item.provider}><td><div className="platform"><span className={item.provider==="facebook"?"account-icon":"pancake small"}>{item.provider==="facebook"?"f":"P"}</span><b>{item.provider==="facebook"?"Meta Business":"Pancake POS"}</b></div></td><td><b>{item.accountName}</b><small className="sku">ID: {item.externalAccountId}</small></td><td>{item.provider==="facebook"?"Ads read · Business read":"Đơn hàng · Sản phẩm · POS"}</td><td>{item.provider==="pancake"?`${item.metadata?.shops?.length??1} shop · ${item.metadata?.summary?.orderCount??0} đơn`:`${item.metadata?.businesses?.length??0} BM · ${item.metadata?.adAccounts?.length??0} tài khoản Ads`}</td><td>{new Date(item.metadata?.lastSyncedAt??item.updatedAt).toLocaleString("vi-VN")}</td><td><span className={`status ${item.status==="active"?"live":"die"}`}>● {item.status==="active"?"Đã xác minh":"Cần xác minh"}</span></td><td><button className="row-action" onClick={item.provider==="facebook"?()=>syncFacebookAssets(false):()=>syncPancakeData(false)}>Đồng bộ</button></td></tr>)}
            {!connections.length&&<tr><td colSpan={7}><div className="empty-connections">Chưa có nguồn dữ liệu nào. Nhấn “Kết nối tài khoản” để bắt đầu.</div></td></tr>}
          </tbody></table></div>
        </section>
        <div className="security-note"><span>⌾</span><div><b>Kết nối an toàn bằng OAuth</b><p>Mật khẩu không được lưu trên AdPilot. Bạn có thể thu hồi quyền truy cập bất cứ lúc nào từ Meta hoặc Pancake.</p></div></div>
      </DetailPage>}
      <footer className="page-footer"><span>AdPilot Ops · Dữ liệu đồng bộ từ Meta & Pancake</span><span><i className="live-dot"/> Hệ thống hoạt động bình thường</span></footer>
    </section>
    {showConnect && <div className="modal-backdrop" onMouseDown={()=>{setShowConnect(false);setConnectMode("choose")}}><section className="connect-modal" role="dialog" aria-modal="true" aria-label="Kết nối tài khoản" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" aria-label="Đóng" onClick={()=>{setShowConnect(false);setConnectMode("choose")}}>×</button><h2>{connectMode==="choose"?"Kết nối nguồn dữ liệu":connectMode==="facebook"?"Kết nối Facebook Business":"Kết nối Pancake POS"}</h2><p>{connectMode==="choose"?"Chọn tài khoản bạn muốn đăng nhập và cấp quyền đọc báo cáo.":connectMode==="facebook"?"Owner nhập App Secret một lần để mã hóa trên máy chủ, sau đó tiếp tục đăng nhập Facebook.":"Tạo API Key trong Pancake POS rồi dán vào bên dưới. Không nhập mật khẩu Pancake."}</p>{connectMode==="choose"?<div className="provider-list">
      <button disabled={connecting} onClick={()=>setConnectMode("facebook")}><span className="account-icon large">f</span><span><b>Đăng nhập bằng Facebook</b><small>Kết nối Business Manager và tài khoản quảng cáo</small></span><em>→</em></button>
      <button onClick={()=>setConnectMode("pancake")}><span className="pancake">P</span><span><b>Kết nối Pancake POS</b><small>Đồng bộ shop, pages, đơn hàng và sản phẩm</small></span><em>→</em></button>
    </div>:connectMode==="facebook"?<div className="pancake-key-form"><label>Meta App Secret<input type="password" autoComplete="off" value={metaAppSecret} onChange={e=>setMetaAppSecret(e.target.value)} placeholder="Dán App Secret tại đây"/></label><small>Chỉ tài khoản Owner được lưu khóa. Khóa được mã hóa trước khi ghi vào cơ sở dữ liệu và không xuất hiện trong bảng tài khoản.</small><div><button onClick={()=>setConnectMode("choose")}>Quay lại</button><button disabled={connecting||metaAppSecret.length<20} onClick={configureFacebook}>{connecting?"Đang bảo mật…":"Lưu & đăng nhập Facebook"}</button></div></div>:<div className="pancake-key-form"><label>API Key Pancake<input type="password" autoComplete="off" value={pancakeApiKey} onChange={e=>setPancakeApiKey(e.target.value)} placeholder="Dán API Key tại đây"/></label><small>Pancake POS → Cài đặt → Kết nối bên thứ ba → Webhook/API → Tạo API Key.</small><div><button onClick={()=>setConnectMode("choose")}>Quay lại</button><button disabled={connecting||pancakeApiKey.length<12} onClick={connectPancake}>{connecting?"Đang xác minh…":"Kết nối & đồng bộ"}</button></div></div>}<div className="oauth-info">{connectMode==="choose"?"Facebook sẽ mở trang cấp quyền chính thức. AdPilot không nhìn thấy mật khẩu Facebook của bạn.":"Khóa kết nối được mã hóa AES-GCM và chỉ lưu ở máy chủ."}</div></section></div>}
    {notice && <div className="toast">✓ {notice}</div>}
  </main>;
}

function DetailPage({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) {
  return <div className="detail-page"><section className="detail-title"><div><h2>{title}</h2><p>{subtitle}</p></div><div className="filter-chips"><button className="selected">Tất cả BM</button><button>BM AURORA</button><button>BM NORTH</button></div></section>{children}</div>;
}
function Mini({label,value,accent=false}:{label:string;value:string;accent?:boolean}) { return <article className={`mini ${accent?"accent":""}`}><p>{label}</p><b>{value}</b></article> }
function AccountTable({rows,mode}:{rows:AccountRow[];mode:string}) { return <div className="table-wrap"><table><thead><tr><th>TÀI KHOẢN</th><th>BUSINESS MANAGER</th><th>{mode==="status"?"TRẠNG THÁI":"CHI TIÊU TRONG KỲ"}</th><th>{mode==="spend"?"NGÀY TRƯỚC":"DOANH THU"}</th><th>{mode==="status"?"PHÂN PHỐI":"ROAS"}</th><th>TRẠNG THÁI</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td><div className="account"><span className="account-icon">f</span><b>{a.name}</b></div></td><td>{a.bm}</td><td>{mode==="status"?<span className={`status ${a.status==="Live"?"live":"die"}`}>● {a.status}</span>:<b>{money(a.spent)}</b>}</td><td>{mode==="spend"?money(a.yesterday):money(a.revenue)}</td><td>{mode==="status"?(a.status==="Live"?"Bình thường":"Đã dừng"):<span className="roas">{a.spent ? (a.revenue/a.spent).toFixed(2) : "0.00"}</span>}</td><td><span className={`status ${a.status==="Live"?"live":"die"}`}>● {a.status}</span></td></tr>)}{!rows.length&&<tr><td colSpan={6}><div className="empty-connections">Chưa có dữ liệu tài khoản cho khoảng ngày này.</div></td></tr>}</tbody></table></div> }
function DailyTable({rows}:{rows:DailyRow[]}){return <section className="panel daily"><div className="panel-head"><div><h2>Tổng hợp theo ngày</h2><p>Dữ liệu trong khoảng đã chọn</p></div></div><div className="table-wrap"><table><thead><tr><th>NGÀY</th><th>CHI TIÊU ADS</th><th>BILL ĐÃ TRẢ</th><th>DOANH THU POS</th><th>COST ĐÃ GỬI</th><th>ROAS</th></tr></thead><tbody>{rows.map(d=><tr key={d.date}><td><b>{d.date.split("-").reverse().join("/")}</b></td><td>{money(d.ads)}</td><td>{money(d.bills)}</td><td><b>{money(d.revenue)}</b></td><td>{money(d.cost)}</td><td><span className="roas">{d.ads ? (d.revenue/d.ads).toFixed(2) : "0.00"}</span></td></tr>)}{!rows.length&&<tr><td colSpan={6}><div className="empty-connections">Chưa có dữ liệu theo ngày. Nhấn “Áp dụng” để đồng bộ Meta.</div></td></tr>}</tbody></table></div></section>}
type ProductRow = { name: string; sku: string; orders: number; revenue: number; cost: number };
function ProductTable({rows}:{rows:ProductRow[]}){return <section className="panel product-table"><div className="panel-head"><div><h2>Theo sản phẩm</h2><p>Dữ liệu thật từ Pancake</p></div></div><div className="table-wrap"><table><thead><tr><th>SẢN PHẨM</th><th>SỐ LƯỢNG</th><th>DOANH THU</th><th>GIÁ VỐN</th></tr></thead><tbody>{rows.map(p=><tr key={p.sku}><td><b>{p.name}</b><small className="sku">{p.sku}</small></td><td>{p.orders}</td><td>{money(p.revenue)}</td><td>{money(p.cost)}</td></tr>)}{!rows.length&&<tr><td colSpan={4}><div className="empty-connections">Chưa có dữ liệu đơn hàng theo sản phẩm.</div></td></tr>}</tbody></table></div></section>}
function ProductCostTable({rows}:{rows:ProductRow[]}){return <div className="table-wrap"><table><thead><tr><th>SẢN PHẨM</th><th>SKU</th><th>SỐ LƯỢNG</th><th>GIÁ VỐN / SP</th><th>TỔNG COST</th></tr></thead><tbody>{rows.map(p=><tr key={p.sku}><td><b>{p.name}</b></td><td>{p.sku}</td><td>{p.orders}</td><td>{money(p.orders ? p.cost/p.orders : 0)}</td><td><b>{money(p.cost)}</b></td></tr>)}{!rows.length&&<tr><td colSpan={5}><div className="empty-connections">Pancake chưa trả về giá vốn sản phẩm trong khoảng ngày này.</div></td></tr>}</tbody></table></div>}
function EmptyData({message}:{message:string}) { return <div className="empty-connections">{message}</div> }
