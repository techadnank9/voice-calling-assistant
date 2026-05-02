import { env } from './config.js';
import { logger } from './logger.js';

function isConfigured(): boolean {
  return Boolean(env.CLOVER_MERCHANT_ID && env.CLOVER_API_TOKEN);
}

export async function sendOrderToClover(params: {
  customerName: string;
  callerPhone: string | null;
  pickupTime: string;
  totalCents: number;
  items: Array<{ name: string; qty: number; lineTotalCents: number }>;
}): Promise<void> {
  if (!isConfigured()) return;

  const base = `https://api.clover.com/v3/merchants/${env.CLOVER_MERCHANT_ID}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.CLOVER_API_TOKEN}`,
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
    body: JSON.stringify({ note: noteText })
  });
  const order = await orderRes.json() as { id?: string; message?: string };
  if (!orderRes.ok) throw new Error(`Clover create order failed: ${order?.message ?? orderRes.status}`);
  if (!order.id) throw new Error('Clover create order: no id in response');

  // 2. Add line items
  for (const item of params.items) {
    const unitPrice = item.qty > 0 ? Math.round(item.lineTotalCents / item.qty) : item.lineTotalCents;
    const lineRes = await fetch(`${base}/orders/${order.id}/line_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: item.name,
        price: unitPrice,
        unitQty: item.qty * 1000
      })
    });
    if (!lineRes.ok) {
      const lineErr = await lineRes.json().catch(() => ({})) as { message?: string };
      logger.warn({ cloverOrderId: order.id, item: item.name, status: lineRes.status, err: lineErr?.message }, 'Clover line item add failed');
    }
  }

  logger.info(
    { cloverOrderId: order.id, customerName: params.customerName, itemCount: params.items.length },
    'Order sent to Clover'
  );
}
