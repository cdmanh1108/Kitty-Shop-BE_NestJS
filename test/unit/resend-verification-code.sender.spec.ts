import {
  ResendVerificationCodeSender,
  type ResendEmailClient,
} from '../../src/modules/web-auth/infrastructure/resend-verification-code.sender';
import { testConfig } from './web-auth-test-fixtures';

describe('ResendVerificationCodeSender', () => {
  const createClient = () => {
    const sendEmail = jest.fn<
      ReturnType<ResendEmailClient['sendEmail']>,
      Parameters<ResendEmailClient['sendEmail']>
    >();
    sendEmail.mockResolvedValue({ data: { id: 'resend-message-id' }, error: null, headers: null });
    return { sendEmail, client: { sendEmail } satisfies ResendEmailClient };
  };

  it('sends the configured sender, recipient, subject, code, and actual configured expiry', async () => {
    const { client, sendEmail } = createClient();
    const sender = new ResendVerificationCodeSender(client, testConfig);

    await sender.send('customer@example.test', '123456', 'challenge-123');

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Kitty Test <no-reply@example.test>',
        to: 'customer@example.test',
        subject: 'Mã xác thực tài khoản Kitty',
      }),
      'verification-code-challenge-123',
    );
    const email = sendEmail.mock.calls[0]?.[0];
    expect(email).toBeDefined();
    if (!email) throw new Error('Expected an email payload');
    expect(email.text).toContain('5 phút');
    expect(email.html).toContain('5 phút');
    expect(email.text).toContain('Nếu bạn không thực hiện yêu cầu này');
  });

  it('translates Resend API errors without exposing their raw message', async () => {
    const { client, sendEmail } = createClient();
    sendEmail.mockResolvedValue({
      data: null,
      error: {
        name: 'invalid_from_address',
        message: 'Domain not verified; api key must not escape',
        statusCode: 403,
      },
      headers: null,
    });
    const sender = new ResendVerificationCodeSender(client, testConfig);

    await expect(
      sender.send('customer@example.test', '123456', 'challenge-456'),
    ).rejects.toMatchObject({
      name: 'VerificationCodeDeliveryError',
      reason: 'provider_rejected',
      message: 'Verification code delivery failed',
    });
  });

  it('translates network errors into a safe delivery failure', async () => {
    const { client, sendEmail } = createClient();
    sendEmail.mockRejectedValue(new Error('network error containing secret material'));
    const sender = new ResendVerificationCodeSender(client, testConfig);

    await expect(
      sender.send('customer@example.test', '123456', 'challenge-789'),
    ).rejects.toMatchObject({
      name: 'VerificationCodeDeliveryError',
      reason: 'provider_unavailable',
      message: 'Verification code delivery failed',
    });
  });
});
