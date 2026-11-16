import { vietnameseValidationMessage } from '../../src/common/validation/validation-message';
import { renderRentalEmail } from '../../src/modules/rentals/application/rental-email.template';
import type { RentalEmailSnapshot } from '../../src/modules/rentals/domain/rental-email';

describe('release customer-facing presentation', () => {
  it('keeps field errors understandable and preserves a specific Vietnamese instruction', () => {
    expect(vietnameseValidationMessage('isBoolean', 'must be a boolean value')).toBe(
      'Vui lòng chọn lại tùy chọn này.',
    );
    expect(vietnameseValidationMessage('isUuid', 'must be a UUID')).toBe(
      'Lựa chọn không hợp lệ. Vui lòng chọn lại.',
    );
    expect(vietnameseValidationMessage('min', 'Vui lòng nhập số tiền từ 0 đồng.')).toBe(
      'Vui lòng nhập số tiền từ 0 đồng.',
    );
  });

  it('renders saved payment labels and zero amounts in both email versions without changing the snapshot', () => {
    const snapshot: RentalEmailSnapshot = {
      version: 1,
      event: 'COMPLETED',
      orderCode: 'RT-20261116-000001',
      accountOwned: true,
      customerName: '<Customer & A>',
      shopName: 'KITTY',
      contactPhone: '0901234567',
      contactEmail: 'shop@example.test',
      details: [
        { label: 'Múi giờ', value: 'Asia/Ho_Chi_Minh' },
        { label: 'Tiền đơn còn phải thanh toán', value: '0 ₫' },
        { label: 'Đã thu thêm khi tất toán', value: '0 ₫' },
        { label: 'Đã hoàn lại khi tất toán', value: '200.000 ₫' },
        { label: 'Cọc còn giữ', value: '0 ₫' },
      ],
      items: [{ name: 'Váy Aurora', variant: 'M · Trắng', quantity: 1, free: false }],
    };
    const original = JSON.stringify(snapshot);
    const message = renderRentalEmail(snapshot, {
      webUrl: 'https://kitty.example.test',
      from: 'shop@example.test',
      recipient: 'customer@example.test',
    });
    expect(message.subject).toContain('Đơn thuê đã hoàn tất');
    for (const content of [message.html, message.text]) {
      expect(content).toContain('Đã thu thêm');
      expect(content).toContain('Đã hoàn lại');
      expect(content).toContain('200.000 ₫');
      expect(content).toContain('0 ₫');
      expect(content).not.toContain('khi tất toán');
      expect(content).not.toContain('Asia/Ho_Chi_Minh');
    }
    expect(message.html).toContain('&lt;Customer &amp; A&gt;');
    expect(message.html).toContain('/tai-khoan/don-hang/RT-20261116-000001');
    expect(JSON.stringify(snapshot)).toBe(original);
  });
});
