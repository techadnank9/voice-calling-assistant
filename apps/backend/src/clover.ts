import { env } from './config.js';
import { logger } from './logger.js';

function getCredentials() {
  // Active business: Moms Biryani LLC
  const merchantId = env.CLOVER_BIRYANI_LLC_MERCHANT_ID || env.CLOVER_MERCHANT_ID;
  const apiToken   = env.CLOVER_BIRYANI_LLC_API_TOKEN   || env.CLOVER_API_TOKEN;
  return { merchantId, apiToken };
}

function isConfigured(): boolean {
  const { merchantId, apiToken } = getCredentials();
  return Boolean(merchantId && apiToken);
}

export type CloverResult =
  | { ok: true; cloverOrderId: string }
  | { ok: false; error: string };

export async function sendOrderToClover(params: {
  customerName: string;
  callerPhone: string | null;
  pickupTime: string;
  totalCents: number;
  items: Array<{ name: string; qty: number; lineTotalCents: number }>;
}): Promise<CloverResult> {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };

  const { merchantId, apiToken } = getCredentials();
  const base = `https://api.clover.com/v3/merchants/${merchantId}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
  };

  // 1. Create order shell
  const noteText = [
    params.customerName,
    params.pickupTime ? `pickup: ${params.pickupTime}` : null,
    params.callerPhone ? `phone: ${params.callerPhone}` : null
  ]
    .filter(Boolean)
    .join(' — ');

  const orderRes = await fetch(`${base}/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ note: noteText, state: 'open', orderType: { id: 'QNSM615M68WFE' }, employee: { id: 'Y4M48VMXFKAK2' }, device: { id: '4cd99a42-027e-305a-c5ae-032d15e46d84' }, isOnline: true })
  });
  const order = await orderRes.json() as { id?: string; message?: string };
  if (!orderRes.ok) throw new Error(`Clover create order failed: ${order?.message ?? orderRes.status}`);
  if (!order.id) throw new Error('Clover create order: no id in response');

  // 2. Add line items — one API call per unit so qty is never ambiguous
  for (const item of params.items) {
    const unitPrice = item.qty > 0 ? Math.round(item.lineTotalCents / item.qty) : item.lineTotalCents;
    const units = item.qty > 0 ? item.qty : 1;
    for (let i = 0; i < units; i++) {
      const lineRes = await fetch(`${base}/orders/${order.id}/line_items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: item.name,
          price: unitPrice,
          unitQty: 1000,
          isRevenue: true
        })
      });
      if (!lineRes.ok) {
        const lineErr = await lineRes.json().catch(() => ({})) as { message?: string };
        logger.warn({ cloverOrderId: order.id, item: item.name, status: lineRes.status, err: lineErr?.message }, 'Clover line item add failed');
      } else {
        const lineData = await lineRes.json().catch(() => ({})) as { id?: string };
        logger.debug({ cloverOrderId: order.id, lineItemId: lineData.id, item: item.name, unitPrice }, 'Clover line item added');
      }
    }
  }

  // 3. Set total + assign employee via POST (Clover ignores employee in initial create)
  const totalRes = await fetch(`${base}/orders/${order.id}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ total: params.totalCents, employee: { id: 'Y4M48VMXFKAK2' } })
  });
  if (!totalRes.ok) {
    const totalErr = await totalRes.json().catch(() => ({})) as { message?: string };
    logger.warn({ cloverOrderId: order.id, status: totalRes.status, err: totalErr?.message }, 'Clover order total/employee update failed');
  }

  logger.info(
    { cloverOrderId: order.id, customerName: params.customerName, itemCount: params.items.length, totalCents: params.totalCents },
    'Order sent to Clover'
  );

  return { ok: true, cloverOrderId: order.id };
}
