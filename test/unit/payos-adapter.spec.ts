import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PayOS } from '@payos/node';
import type { AppConfiguration } from '../../src/config/configuration';
import { parsePayosConfiguration } from '../../src/config/payos.configuration';
import { PayosAdapter } from '../../src/modules/payments/infrastructure/payos.adapter';

const credentials = {
  clientId: 'test-client',
  apiKey: 'test-api-key',
  checksumKey: 'test-checksum-key',
};

describe('payOS configuration and signed webhook', () => {
  it('starts with blank keys when checkout is off and rejects partial credentials', () => {
    expect(parsePayosConfiguration({ PAYOS_CHECKOUT_ENABLED: 'false' })).toEqual({
      checkoutEnabled: false,
      ttlMinutes: 15,
    });
    expect(() => parsePayosConfiguration({ PAYOS_CHECKOUT_ENABLED: 'true' })).toThrow(
      'PAYOS_CLIENT_ID',
    );
    expect(() => parsePayosConfiguration({ PAYOS_API_KEY: 'alone' })).toThrow('PAYOS_CLIENT_ID');
  });

  it('verifies the signed data and rejects a changed amount', async () => {
    const sdk = new PayOS({ ...credentials, logLevel: 'off' });
    const config = new ConfigService<AppConfiguration, true>({
      payos: {
        checkoutEnabled: false,
        ttlMinutes: 15,
        credentials,
        webOrigin: 'https://storefront.example',
      },
    });
    const client = new PayosAdapter(config);
    const data = {
      orderCode: 1000000000000,
      amount: 260000,
      description: 'KITTY',
      accountNumber: '12345678',
      reference: 'BANK-TX-123',
      transactionDateTime: '2026-10-01 19:10:00',
      currency: 'VND',
      paymentLinkId: 'test-link',
      code: '00',
      desc: 'success',
    };
    const signature = await sdk.crypto.createSignatureFromObj(data, credentials.checksumKey);
    const payload = { code: '00', desc: 'success', success: true, data, signature };
    await expect(client.verify(payload)).resolves.toMatchObject({
      reference: data.reference,
      amount: 260000,
      paidAt: new Date('2026-10-01T12:10:00.000Z'),
    });
    await expect(client.verify({ ...payload, data: { ...data, amount: 1 } })).rejects.toThrow();
  });

  it('reports missing credentials without including secrets in the diagnostic', async () => {
    const config = new ConfigService<AppConfiguration, true>({
      payos: { checkoutEnabled: false, ttlMinutes: 15 },
    });
    const client = new PayosAdapter(config);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await expect(client.read(1000000000000)).rejects.toThrow();
      expect(warn.mock.calls).toEqual([
        [
          expect.objectContaining({
            event: 'payment.provider_request_failed',
            provider: 'payos',
            operation: 'read',
            orderCode: 1000000000000,
            category: 'configuration',
          }),
        ],
      ]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('Kênh payOS chưa được cấu hình');
    } finally {
      warn.mockRestore();
    }
  });
});
