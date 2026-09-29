export interface EmailConfiguration {
  resendApiKey: string;
  fromAddress: string;
  fromName: string;
}

export function parseEmailConfiguration(env: Record<string, unknown>): EmailConfiguration {
  const stringValue = (key: string): string => {
    const value = env[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  return {
    resendApiKey: stringValue('RESEND_API_KEY'),
    fromAddress: stringValue('EMAIL_FROM_ADDRESS'),
    fromName: stringValue('EMAIL_FROM_NAME'),
  };
}
