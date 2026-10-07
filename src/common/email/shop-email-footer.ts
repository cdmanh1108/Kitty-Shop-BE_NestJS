// Public KITTY contact details shared by customer-facing email templates.
export const shopEmailBrand = {
  name: 'KITTY – Tiệm cho thuê đồ Cần Thơ',
  tagline: 'Thuê outfit xinh, nhẹ ví hơn.',
  services: 'Cho thuê trang phục · Máy ảnh · Make up',
  address: '23 Đường số 12, KDC Thới Nhựt 1, Tân An, Cần Thơ',
  mapsUrl: 'https://maps.app.goo.gl/gRK5QfsWDYv5DPkv7?g_st=ic',
  openingHours: '08:30–21:00, Thứ 2 đến Chủ nhật',
  phones: ['0939 505 378', '0766 863 919'],
  tiktokUrl: 'https://www.tiktok.com/@kitty.tiemthuedocantho',
} as const;

interface ShopEmailFooterOptions {
  shopName?: string;
  contactPhone?: string;
  contactEmail?: string;
  webUrl?: string;
  notice: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function websiteOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function renderPhone(phone: string): string {
  const number = phone.replace(/[\s().-]/g, '');
  const label = escapeHtml(phone);
  return /^\+?\d{7,15}$/.test(number)
    ? `<a href="tel:${escapeHtml(number)}" style="color:#8f3d59;text-decoration:none;white-space:nowrap">${label}</a>`
    : label;
}

function renderEmail(email: string): string {
  const label = escapeHtml(email);
  return /^[^\s<>@"']+@[^\s<>@"']+\.[^\s<>@"']+$/.test(email)
    ? `<a href="mailto:${label}" style="color:#8f3d59;text-decoration:none;overflow-wrap:anywhere;word-break:break-word">${label}</a>`
    : label;
}

export function renderShopEmailFooter(options: ShopEmailFooterOptions): {
  html: string;
  text: string;
} {
  const name = options.shopName?.trim() || shopEmailBrand.name;
  // Order snapshots supply their captured contact; verification emails use public hotlines.
  const phones =
    options.contactPhone === undefined
      ? shopEmailBrand.phones
      : options.contactPhone.trim()
        ? [options.contactPhone.trim()]
        : [];
  const email = options.contactEmail?.trim();
  const webUrl = websiteOrigin(options.webUrl);
  const phoneLinks = phones.map(renderPhone).join(' <span style="color:#cbb8c0">·</span> ');
  const links = [
    `<a href="${escapeHtml(shopEmailBrand.mapsUrl)}" style="color:#8f3d59;text-decoration:underline">Xem bản đồ</a>`,
    webUrl
      ? `<a href="${escapeHtml(webUrl)}" style="color:#8f3d59;text-decoration:underline">Website</a>`
      : '',
    `<a href="${escapeHtml(shopEmailBrand.tiktokUrl)}" style="color:#8f3d59;text-decoration:underline">TikTok</a>`,
  ]
    .filter(Boolean)
    .join(' <span style="color:#cbb8c0">·</span> ');
  return {
    html: `<tr><td style="padding:20px 8px 0;text-align:left;overflow-wrap:anywhere;word-break:break-word">
      <div style="font-size:14px;line-height:22px;font-weight:700;color:#673e4c">${escapeHtml(name)}</div>
      <div style="margin-top:2px;font-size:12px;line-height:19px;color:#77636c">${escapeHtml(shopEmailBrand.services)}</div>
      <div style="margin-top:9px;font-size:12px;line-height:20px;color:#55464c">${escapeHtml(shopEmailBrand.address)}</div>
      <div style="margin-top:2px;font-size:12px;line-height:20px;color:#77636c">Giờ mở cửa: ${escapeHtml(shopEmailBrand.openingHours)}</div>
      ${phones.length ? `<div style="margin-top:4px;font-size:13px;line-height:21px;color:#55464c">Hotline: ${phoneLinks}</div>` : ''}
      ${email ? `<div style="margin-top:2px;font-size:12px;line-height:20px;color:#55464c">Email: ${renderEmail(email)}</div>` : ''}
      <div style="margin-top:7px;font-size:12px;line-height:20px">${links}</div>
      <p style="margin:12px 0 0;font-size:11px;line-height:18px;color:#77636c">${escapeHtml(options.notice)}</p>
    </td></tr>`,
    text:
      [
        name,
        shopEmailBrand.tagline,
        shopEmailBrand.services,
        `Địa chỉ: ${shopEmailBrand.address}`,
        `Bản đồ: ${shopEmailBrand.mapsUrl}`,
        `Giờ mở cửa: ${shopEmailBrand.openingHours}`,
        phones.length ? `Hotline: ${phones.join(' · ')}` : '',
        email ? `Email: ${email}` : '',
        webUrl ? `Website: ${webUrl}` : '',
        `TikTok: ${shopEmailBrand.tiktokUrl}`,
      ]
        .filter(Boolean)
        .join('\n') + `\n\n${options.notice}`,
  };
}
