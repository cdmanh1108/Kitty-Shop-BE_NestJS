import { renderShopEmailFooter, shopEmailBrand } from '../../../common/email/shop-email-footer';
import type { RentalEmailMessage, RentalEmailSnapshot } from '../domain/rental-email';

type Detail = RentalEmailSnapshot['details'][number];

const copy = {
  CONFIRMED: {
    title: 'Đơn thuê đã được xác nhận',
    intro: 'Lịch thuê của bạn đã được xác nhận. Hẹn gặp bạn vào ngày nhận đồ!',
  },
  COMPLETED: {
    title: 'Đơn thuê đã được tất toán',
    intro: 'Đơn thuê của bạn đã hoàn tất. Cảm ơn bạn đã chọn KITTY và hẹn gặp lại!',
  },
} as const;

const scheduleLabels = new Set([
  'Ngày nhận đồ',
  'Ngày trả đồ',
  'Múi giờ',
  'Cách nhận đồ',
  'Địa chỉ giao đồ',
]);
const paymentLabels = new Set([
  'Tiền thuê',
  'Phí phát sinh / giao nhận',
  'Giảm giá',
  'Tổng tiền đơn (không gồm cọc)',
  'Đã thanh toán cho đơn',
  'Tiền đơn còn phải thanh toán',
]);
const collateralLabels = new Set([
  'Giấy tờ đặt cọc',
  'Cọc dự kiến khi đặt đơn',
  'Tổng cọc đã nhận',
  'Cọc còn giữ',
]);
const settlementLabels = new Set(['Đã thu thêm khi tất toán', 'Đã hoàn lại khi tất toán']);
const shortLabels = new Map([
  ['Phí phát sinh / giao nhận', 'Phụ phí / giao nhận'],
  ['Đã thanh toán cho đơn', 'Đã thanh toán'],
  ['Tiền đơn còn phải thanh toán', 'Còn thanh toán'],
  ['Cọc dự kiến khi đặt đơn', 'Cọc dự kiến'],
  ['Tổng cọc đã nhận', 'Cọc đã nhận'],
  ['Giấy tờ đặt cọc', 'Giấy tờ'],
  ['Cách nhận đồ', 'Hình thức nhận'],
  ['Địa chỉ giao đồ', 'Địa chỉ giao'],
  ['Đã thu thêm khi tất toán', 'Đã thu thêm'],
  ['Đã hoàn lại khi tất toán', 'Đã hoàn lại'],
]);

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function multiline(value: string): string {
  return escape(value).replace(/\r\n|\r|\n/g, '<br>');
}

function renderRows(rows: Detail[]): string {
  if (!rows.length) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    ${rows
      .map((row) => {
        const balance = row.label === 'Tiền đơn còn phải thanh toán';
        const label = shortLabels.get(row.label) ?? row.label;
        if (
          row.label === 'Địa chỉ giao đồ' ||
          row.label === 'Giấy tờ đặt cọc' ||
          /[\r\n]/.test(row.value)
        ) {
          return `<tr><td colspan="2" style="padding:4px 0">
            <div style="font-size:12px;line-height:18px;color:#77636c">${escape(label)}</div>
            <div style="margin-top:2px;font-size:13px;line-height:20px;color:#30252a;overflow-wrap:anywhere;word-break:break-word">${multiline(row.value)}</div>
          </td></tr>`;
        }
        return `<tr>
        <td valign="top" width="58%" style="padding:4px 12px 4px 0;font-size:13px;line-height:20px;color:${balance ? '#30252a' : '#77636c'};${balance ? 'font-weight:700;' : ''}">${escape(label)}</td>
        <td align="right" valign="top" style="padding:4px 0;font-size:13px;line-height:20px;overflow-wrap:anywhere;word-break:break-word;color:${balance ? '#8f3d59' : '#30252a'};${balance ? 'font-weight:700;' : ''}">${multiline(row.value)}</td>
      </tr>`;
      })
      .join('')}
  </table>`;
}

function renderSection(title: string, content: string): string {
  if (!content) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px">
    <tr><td style="border-top:1px solid #eadde2;padding-top:12px">
      <h2 style="margin:0 0 8px;font-size:15px;line-height:22px;font-weight:700;color:#673e4c">${escape(title)}</h2>
      ${content}
    </td></tr>
  </table>`;
}

function renderSchedule(rows: Detail[]): string {
  if (!rows.length) return '';
  const dates = rows.filter((row) => row.label === 'Ngày nhận đồ' || row.label === 'Ngày trả đồ');
  const timezone = rows.find((row) => row.label === 'Múi giờ');
  const timezoneLabel = timezone
    ? ['Asia/Ho_Chi_Minh', 'Asia/Saigon'].includes(timezone.value)
      ? 'Giờ Việt Nam (UTC+7)'
      : `Giờ cửa hàng (${timezone.value})`
    : '';
  const delivery = rows.filter(
    (row) => row.label === 'Cách nhận đồ' || row.label === 'Địa chỉ giao đồ',
  );
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;background:#fcf8f9;border:1px solid #eddde4;border-radius:12px">
    ${
      dates.length
        ? `<tr>${dates
            .map(
              (
                row,
                index,
              ) => `<td valign="top" width="50%" style="padding:12px 16px;${index > 0 ? 'border-left:1px solid #eddde4;' : ''}">
      <div style="font-size:12px;line-height:18px;color:#77636c">${row.label === 'Ngày nhận đồ' ? 'Nhận đồ' : 'Trả đồ'}</div>
      <div style="margin-top:4px;font-size:14px;line-height:21px;font-weight:700;color:#673e4c;overflow-wrap:anywhere;word-break:break-word">${multiline(row.value)}</div>
    </td>`,
            )
            .join('')}</tr>`
        : ''
    }
    ${timezoneLabel ? `<tr><td colspan="2" style="padding:0 16px 12px;font-size:11px;line-height:17px;color:#77636c">${escape(timezoneLabel)}</td></tr>` : ''}
    ${delivery.length ? `<tr><td colspan="2" style="padding:8px 16px;border-top:1px solid #eddde4">${renderRows(delivery)}</td></tr>` : ''}
  </table>`;
}

function renderItems(items: RentalEmailSnapshot['items']): string {
  if (!items.length) return '';
  const count = items.reduce((total, item) => total + item.quantity, 0);
  return renderSection(
    `Đồ thuê · ${count} món`,
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      ${items
        .map(
          (item, index) => `<tr>
        <td valign="top" style="padding:6px 12px 6px 0;${index > 0 ? 'border-top:1px solid #f5e8ed;' : ''}">
          <div style="font-size:14px;line-height:21px;font-weight:700;color:#30252a;overflow-wrap:anywhere;word-break:break-word">${escape(item.name)}</div>
          ${item.variant ? `<div style="margin-top:2px;font-size:12px;line-height:18px;color:#77636c;overflow-wrap:anywhere;word-break:break-word">${escape(item.variant)}</div>` : ''}
          ${item.free ? '<div style="margin-top:3px;font-size:11px;line-height:17px;font-weight:700;color:#8f3d59">Thuê kèm miễn phí</div>' : ''}
        </td>
        <td align="right" valign="top" width="44" style="padding:6px 0;font-size:14px;line-height:21px;font-weight:700;color:#673e4c;white-space:nowrap;${index > 0 ? 'border-top:1px solid #f5e8ed;' : ''}">× ${item.quantity}</td>
      </tr>`,
        )
        .join('')}
    </table>`,
  );
}

function renderPayment(rows: Detail[]): string {
  const total = rows.find((row) => row.label === 'Tổng tiền đơn (không gồm cọc)');
  const breakdown = rows.filter((row) => row !== total);
  const summary = total
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:9px;background:#fcf8f9;border:1px solid #eddde4;border-radius:12px">
        <tr><td style="padding:12px 16px">
          <div style="font-size:12px;line-height:18px;color:#77636c">Tổng tiền đơn <span style="font-size:11px">· Không gồm cọc</span></div>
          <div style="margin-top:3px;font-size:23px;line-height:30px;font-weight:700;color:#8f3d59;overflow-wrap:anywhere;word-break:break-word">${multiline(total.value)}</div>
        </td></tr>
      </table>`
    : '';
  return renderSection('Thanh toán', summary + renderRows(breakdown));
}

function renderSettlement(rows: Detail[]): string {
  if (!rows.length) return '';
  return renderSection(
    'Kết quả tất toán',
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fcf8f9;border:1px solid #eddde4;border-radius:12px">
      <tr>${rows
        .map(
          (
            row,
            index,
          ) => `<td valign="top" width="50%" style="padding:12px 16px;${index > 0 ? 'border-left:1px solid #eddde4;' : ''}">
        <div style="font-size:12px;line-height:18px;color:#77636c">${escape(shortLabels.get(row.label) ?? row.label)}</div>
        <div style="margin-top:3px;font-size:18px;line-height:25px;font-weight:700;color:#8f3d59;overflow-wrap:anywhere;word-break:break-word">${multiline(row.value)}</div>
      </td>`,
        )
        .join('')}</tr>
    </table>`,
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
  const logoUrl = new URL('/brand/kitty-logo.jpg', options.webUrl).href;
  const footer = renderShopEmailFooter({
    shopName: snapshot.shopName,
    contactPhone: snapshot.contactPhone,
    contactEmail: snapshot.contactEmail,
    webUrl: options.webUrl,
    notice: 'Bạn nhận email này vì đã đặt thuê qua website KITTY.',
  });
  const schedule = snapshot.details.filter((row) => scheduleLabels.has(row.label));
  const payment = snapshot.details.filter((row) => paymentLabels.has(row.label));
  const collateral = snapshot.details.filter((row) => collateralLabels.has(row.label));
  const settlement = snapshot.details.filter((row) => settlementLabels.has(row.label));
  const other = snapshot.details.filter(
    (row) =>
      !scheduleLabels.has(row.label) &&
      !paymentLabels.has(row.label) &&
      !collateralLabels.has(row.label) &&
      !settlementLabels.has(row.label),
  );
  const itemLabel = (item: RentalEmailSnapshot['items'][number]): string =>
    `${item.name}${item.variant ? ` · ${item.variant}` : ''} × ${item.quantity}${item.free ? ' · Thuê kèm miễn phí' : ''}`;
  const text = [
    `${snapshot.shopName}\n${title}\nĐơn ${snapshot.orderCode}`,
    `Xin chào ${snapshot.customerName},\n${intro}`,
    snapshot.items.length ? `ĐỒ THUÊ\n${snapshot.items.map(itemLabel).join('\n')}` : '',
    snapshot.details.map((row) => `${row.label}: ${row.value}`).join('\n'),
    `Xem chi tiết đơn thuê: ${url}${!snapshot.accountOwned ? '\nNhập số điện thoại đã đặt đơn để tra cứu.' : ''}`,
    footer.text,
  ]
    .filter(Boolean)
    .join('\n\n');
  const buttonLabel = snapshot.accountOwned ? 'Xem chi tiết đơn thuê' : 'Tra cứu đơn thuê';
  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escape(title)}</title>
    <style>@media only screen and (max-width:600px){.email-shell{padding:20px 12px!important}.email-card{padding:24px 20px!important}}</style>
  </head>
  <body style="margin:0;padding:0;background:#fcf8f9;color:#30252a;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escape(`${title} · ${snapshot.orderCode}. ${intro}`)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fcf8f9">
      <tr><td class="email-shell" align="center" style="padding:28px 16px">
        <!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" align="center" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
          <tr><td align="center" style="padding:0 0 18px">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:12px"><img src="${escape(logoUrl)}" width="60" height="60" alt="KITTY" style="display:block;border:0;border-radius:50%;width:60px;height:60px"></td>
                <td valign="middle">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:27px;line-height:33px;letter-spacing:4px;font-weight:700;color:#673e4c">KITTY</div>
                  <div style="margin-top:2px;font-size:12px;line-height:18px;color:#77636c">${escape(shopEmailBrand.tagline)}</div>
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td class="email-card" style="padding:24px;background:#fff;border:1px solid #eadde2;border-radius:18px;box-shadow:0 8px 28px rgba(103,62,76,.07)">
            <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;color:#a34865;overflow-wrap:anywhere;word-break:break-word">ĐƠN ${escape(snapshot.orderCode)}</div>
            <h1 style="margin:8px 0 12px;font-size:25px;line-height:32px;color:#30252a">${escape(title)}</h1>
            <p style="margin:0;font-size:14px;line-height:22px;color:#55464c;overflow-wrap:anywhere;word-break:break-word">Xin chào <strong style="color:#30252a">${escape(snapshot.customerName)}</strong>,<br>${escape(intro)}</p>
            ${renderSchedule(schedule)}
            ${renderItems(snapshot.items)}
            ${renderPayment(payment)}
            ${renderSection('Đặt cọc', renderRows(collateral))}
            ${renderSettlement(settlement)}
            ${renderSection('Thông tin khác', renderRows(other))}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px">
              <tr><td align="center" bgcolor="#a34865" style="padding:13px 16px;border-radius:9px"><a href="${escape(url)}" style="display:block;font-size:14px;line-height:22px;font-weight:700;color:#fff;text-decoration:none">${buttonLabel}</a></td></tr>
            </table>
            ${!snapshot.accountOwned ? '<p style="margin:9px 0 0;text-align:center;font-size:12px;line-height:18px;color:#77636c">Dùng số điện thoại đã đặt đơn để tra cứu.</p>' : ''}
          </td></tr>
          ${footer.html}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td></tr>
    </table>
  </body>
</html>`;
  return {
    from: options.from,
    to: options.recipient,
    subject: `${title} · ${snapshot.orderCode}`.replace(/[\r\n]/g, ' ').slice(0, 255),
    text,
    html,
  };
}
