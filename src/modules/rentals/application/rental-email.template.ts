import type { RentalEmailMessage, RentalEmailSnapshot } from '../domain/rental-email';

const copy = {
  CONFIRMED: {
    title: 'Đơn thuê đã được xác nhận',
    intro:
      'Cửa hàng đã xác nhận đơn thuê của bạn. Vui lòng kiểm tra lịch nhận – trả và thông tin thanh toán dưới đây.',
  },
  COMPLETED: {
    title: 'Đơn thuê đã được tất toán',
    intro:
      'Cửa hàng đã hoàn tất tất toán đơn thuê. Cảm ơn bạn đã chọn Kitty; dưới đây là thông tin tổng kết đơn của bạn.',
  },
} as const;

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

export function renderRentalEmail(
  snapshot: RentalEmailSnapshot,
  options: { webUrl: string; from: string; recipient: string },
): RentalEmailMessage {
  const { title, intro } = copy[snapshot.event];
  const path = snapshot.accountOwned
    ? `/tai-khoan/don-hang/${encodeURIComponent(snapshot.orderCode)}`
    : `/tra-cuu-don?code=${encodeURIComponent(snapshot.orderCode)}`;
  const url = new URL(path, options.webUrl).href;
  const itemLabel = (item: RentalEmailSnapshot['items'][number]): string =>
    `${item.name}${item.variant ? ` · ${item.variant}` : ''} × ${item.quantity}${item.free ? ' · Phụ kiện thuê kèm miễn phí' : ''}`;
  const text = [
    snapshot.shopName,
    title,
    `Đơn ${snapshot.orderCode}`,
    `Xin chào ${snapshot.customerName},`,
    intro,
    '',
    ...snapshot.items.map(itemLabel),
    '',
    ...snapshot.details.map((row) => `${row.label}: ${row.value}`),
    '',
    `Xem đơn thuê: ${url}`,
    !snapshot.accountOwned ? 'Nhập số điện thoại đã đặt đơn để tra cứu.' : '',
    snapshot.contactPhone ? `Liên hệ cửa hàng: ${snapshot.contactPhone}` : '',
    snapshot.contactEmail ? `Email cửa hàng: ${snapshot.contactEmail}` : '',
    'Bạn nhận email này vì đã đặt thuê qua website Kitty.',
  ]
    .filter((line) => line !== '')
    .join('\n');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#FCF8F9;color:#30252A;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px">
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:600px;margin:auto;background:#fff;border:1px solid #E8D8DF;border-radius:12px"><tr><td style="padding:28px">
  <p style="margin:0 0 12px;color:#A34865;font-size:16px;font-weight:bold">${escape(snapshot.shopName)}</p>
  <h1 style="font-size:24px;line-height:32px;margin:0 0 8px">${escape(title)}</h1>
  <p style="color:#77636C;margin:0 0 24px">Đơn ${escape(snapshot.orderCode)}</p>
  <p>Xin chào ${escape(snapshot.customerName)},</p><p style="line-height:24px">${escape(intro)}</p>
  <h2 style="font-size:17px;margin-top:24px">Đồ thuê và phụ kiện</h2>
  ${snapshot.items.map((item) => `<p style="line-height:24px;overflow-wrap:anywhere">${escape(itemLabel(item))}</p>`).join('')}
  <h2 style="font-size:17px;margin-top:24px">Thông tin đơn thuê</h2>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${snapshot.details.map((row) => `<tr><td style="padding:10px 8px 10px 0;border-bottom:1px solid #E8D8DF;color:#77636C;vertical-align:top;width:45%">${escape(row.label)}</td><td style="padding:10px 0;border-bottom:1px solid #E8D8DF;vertical-align:top;overflow-wrap:anywhere;white-space:pre-line">${escape(row.value)}</td></tr>`).join('')}</table>
  <p style="margin:28px 0"><a href="${escape(url)}" style="display:inline-block;background:#A34865;color:#fff;text-decoration:none;border-radius:9px;padding:14px 20px;font-weight:bold">Xem đơn thuê</a></p>
  ${!snapshot.accountOwned ? '<p style="font-size:13px;color:#77636C">Nhập số điện thoại đã đặt đơn để tra cứu.</p>' : ''}
  <p style="line-height:22px;font-size:14px">${snapshot.contactPhone ? `Liên hệ cửa hàng: ${escape(snapshot.contactPhone)}<br>` : ''}${snapshot.contactEmail ? `Email cửa hàng: ${escape(snapshot.contactEmail)}` : ''}</p>
  <p style="color:#77636C;font-size:12px;line-height:20px">Bạn nhận email này vì đã đặt thuê qua website Kitty.</p>
  </td></tr></table></td></tr></table></body></html>`;
  return {
    from: options.from,
    to: options.recipient,
    subject: `${title} · ${snapshot.orderCode}`.replace(/[\r\n]/g, ' ').slice(0, 255),
    text,
    html,
  };
}
