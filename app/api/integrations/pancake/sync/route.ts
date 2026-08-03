import {
  loadIntegrationMetadata,
  loadIntegrationToken,
  requireFirebaseUser,
  updateIntegrationMetadata,
} from "../../_shared";

type Shop = { id: number; name: string; pageCount?: number };
type PancakeOrder = Record<string, unknown>;
type PancakeItem = Record<string, unknown>;

const numberValue = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const textValue = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const dayOf = (order: PancakeOrder) =>
  textValue(order.inserted_at, order.created_at, order.creation_time, order.updated_at).slice(0, 10);

const orderTotal = (order: PancakeOrder) =>
  numberValue(order.total_price, order.total, order.order_value, order.cod, order.total_amount);

const orderItems = (order: PancakeOrder) => {
  const rows = order.items ?? order.order_items ?? order.products;
  return Array.isArray(rows) ? rows as PancakeItem[] : [];
};

const returnedStatuses = new Set([-1, 4, 5, 15]);
const confirmedStatuses = new Set([1, 2, 3, 8, 9, 12, 13, 16, 20]);
const shippedStatuses = new Set([2, 3, 4, 5, 15, 16]);
const cancelled = (order: PancakeOrder) => {
  const statusCode = numberValue(order.status);
  const statusName = textValue(order.status_name, order.shipping_status, order.order_status);
  return returnedStatuses.has(statusCode) ||
    /cancel|cancelled|canceled|hủy|returned|return|hoàn/.test(statusName.toLowerCase());
};

async function fetchOrders(shopId: number, apiKey: string, from: string, to: string) {
  const orders: PancakeOrder[] = [];
  const startDateTime = Math.floor(new Date(`${from}T00:00:00+07:00`).getTime() / 1000);
  const endDateTime = Math.floor(new Date(`${to}T23:59:59+07:00`).getTime() / 1000);
  let totalPages = 1;
  for (let page = 1; page <= totalPages && page <= 500; page += 1) {
    const url = new URL(`https://pos.pages.fm/api/v1/shops/${shopId}/orders`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("page_number", String(page));
    url.searchParams.set("page_size", "100");
    url.searchParams.set("updateStatus", "inserted_at");
    url.searchParams.set("startDateTime", String(startDateTime));
    url.searchParams.set("endDateTime", String(endDateTime));
    url.searchParams.set("option_sort", "inserted_at_asc");
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`pancake_${response.status}`);
    const payload = await response.json() as {
      success?: boolean;
      orders?: PancakeOrder[];
      data?: PancakeOrder[];
      total_pages?: number;
    };
    const rows = payload.orders ?? payload.data ?? [];
    if (!Array.isArray(rows)) throw new Error("pancake_invalid_orders");
    orders.push(...rows);
    totalPages = Math.max(1, Number(payload.total_pages ?? 1));
    if (rows.length === 0) break;
  }
  return orders.filter(order => {
    const day = dayOf(order);
    return day && day >= from && day <= to;
  });
}

export async function POST(request: Request) {
  const user = await requireFirebaseUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = await loadIntegrationToken(user.uid, "pancake");
  if (!apiKey) return Response.json({ error: "pancake_not_connected" }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { from?: string; to?: string };
  const today = new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from ?? "") ? body.from! : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(body.to ?? "") ? body.to! : today;
  const current = await loadIntegrationMetadata<{ shops?: Shop[] }>(user.uid, "pancake");
  const shops = current?.shops ?? [];
  if (!shops.length) return Response.json({ error: "pancake_shops_missing" }, { status: 409 });

  try {
    const shopOrders = await Promise.all(shops.map(async shop => ({
      shop,
      orders: await fetchOrders(shop.id, apiKey, from, to),
    })));
    const dailyMap = new Map<string, { orders: number; confirmed: number; shipped: number; revenue: number; cost: number; cancelled: number }>();
    const productMap = new Map<string, { name: string; sku: string; orders: number; revenue: number; cost: number }>();
    let orderCount = 0;
    let revenue = 0;
    let cancelledCount = 0;
    let confirmedCount = 0;
    let shippedCount = 0;
    let completedCount = 0;
    let newCount = 0;

    for (const { orders } of shopOrders) {
      for (const order of orders) {
        const date = dayOf(order);
        const statusCode = numberValue(order.status);
        const isCancelled = cancelled(order);
        const isConfirmed = confirmedStatuses.has(statusCode) && !isCancelled;
        const isShipped = shippedStatuses.has(statusCode);
        const total = isConfirmed ? orderTotal(order) : 0;
        orderCount += 1;
        revenue += total;
        if (isCancelled) cancelledCount += 1;
        if (isConfirmed) confirmedCount += 1;
        if (isShipped) shippedCount += 1;
        if ([3, 16].includes(statusCode)) completedCount += 1;
        if (statusCode === 0) newCount += 1;
        const day = dailyMap.get(date) ?? { orders: 0, confirmed: 0, shipped: 0, revenue: 0, cost: 0, cancelled: 0 };
        day.orders += 1;
        day.revenue += total;
        if (isCancelled) day.cancelled += 1;
        if (isConfirmed) day.confirmed += 1;
        if (isShipped) day.shipped += 1;

        for (const item of orderItems(order)) {
          const variation = (item.variation_info && typeof item.variation_info === "object")
            ? item.variation_info as Record<string, unknown>
            : {};
          const sku = textValue(
            variation.display_id,
            variation.product_display_id,
            variation.barcode,
            item.variation_id,
            item.product_id,
          ) || "Không có mã";
          const name = textValue(variation.name, item.product_name, item.name) || sku;
          const quantity = Math.max(1, numberValue(item.quantity, item.count, 1));
          const unitRevenue = numberValue(variation.retail_price, item.price);
          const itemRevenue = Math.max(0, unitRevenue * quantity - numberValue(item.discount_each_product));
          const itemCost = numberValue(variation.avg_price, variation.last_imported_price) * quantity;
          const product = productMap.get(sku) ?? { name, sku, orders: 0, revenue: 0, cost: 0 };
          if (isConfirmed) {
            product.orders += quantity;
            product.revenue += itemRevenue;
          }
          if (isShipped) product.cost += itemCost;
          productMap.set(sku, product);
          if (isShipped) day.cost += itemCost;
        }
        dailyMap.set(date, day);
      }
    }

    const lastSyncedAt = Date.now();
    const metadata = {
      ...current,
      reportRange: { from, to },
      summary: {
        orderCount,
        confirmedCount,
        shippedCount,
        completedCount,
        newCount,
        revenue,
        cancelledCount,
      },
      syncQuality: {
        complete: true,
        shopCount: shops.length,
        source: "inserted_at",
        timezone: "Asia/Ho_Chi_Minh",
      },
      daily: [...dailyMap.entries()].map(([date, values]) => ({ date, ...values })),
      products: [...productMap.values()].sort((a, b) => b.revenue - a.revenue),
      lastSyncedAt,
    };
    await updateIntegrationMetadata(user.uid, "pancake", metadata);
    return Response.json({ success: true, orderCount, revenue, cancelledCount, lastSyncedAt });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "pancake_sync_failed";
    return Response.json({ error: code }, { status: 502 });
  }
}
