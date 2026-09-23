import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import {
  ApplicationLogger,
  redactLog,
  summarizeError,
} from '../src/common/logging/application-logger';
import { safeErrorDiagnostic } from '../src/common/logging/safe-error-diagnostic';
import { RequestContextMiddleware } from '../src/common/middleware/request-context.middleware';
import { withRequestContext } from '../src/common/request-context/request-context';

describe('application logging', () => {
  afterEach(() => jest.restoreAllMocks());

  it('redacts nested secrets and suppresses exception messages and stacks', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = JSON.stringify(
      redactLog({
        nested: [{ refreshToken: 'sensitive', password: 'sensitive', authorization: 'sensitive' }],
        error: new Error('sensitive'),
        circular,
        message: 'Bearer sensitive https://user:pass@example.com/?secret=sensitive',
      }),
    );
    expect(result).not.toContain('sensitive');
    expect(result).toContain('Truncated');
    expect(result).toContain('errorType');
  });

  it('classifies safe startup and Prisma connection failures without exposing messages', () => {
    const configurationError = new Error('OTP bypass is forbidden in production');
    const databaseError = Object.assign(new Error('sensitive database failure'), {
      errorCode: 'P1001',
    });

    const configurationDiagnostic = summarizeError(configurationError);
    const databaseDiagnostic = summarizeError(databaseError);
    expect(configurationDiagnostic).toMatchObject({
      errorType: 'Error',
      reason: 'CONFIG_AUTH_OTP_BYPASS_FORBIDDEN',
    });
    expect(configurationDiagnostic.fingerprint).toMatch(/^v1:[a-f0-9]{24}$/);
    expect(databaseDiagnostic).toMatchObject({
      errorType: 'Error',
      errorCode: 'P1001',
      reason: 'DATABASE_SERVER_UNREACHABLE',
    });
    expect(databaseDiagnostic.fingerprint).toMatch(/^v1:[a-f0-9]{24}$/);
    expect(JSON.stringify(redactLog(databaseError))).not.toContain('sensitive database failure');
  });

  it('keeps bounded app frames and distinguishes same-class errors by location', () => {
    const rentalError = new Error('token=secret-rental');
    Object.defineProperty(rentalError, 'stack', {
      value:
        'Error: token=secret-rental\n    at fn (/app/src/modules/rentals/rental.service.ts:10:5)',
    });
    const financeError = new Error('phone=0900123456');
    Object.defineProperty(financeError, 'stack', {
      value:
        'Error: phone=0900123456\n    at fn (/app/src/modules/finance/finance.service.ts:20:7)',
    });

    const rentalDiagnostic = safeErrorDiagnostic(rentalError);
    const financeDiagnostic = safeErrorDiagnostic(financeError);

    expect(rentalDiagnostic.frames).toEqual(['src/modules/rentals/rental.service.ts:10']);
    expect(financeDiagnostic.frames).toEqual(['src/modules/finance/finance.service.ts:20']);
    expect(rentalDiagnostic.fingerprint).not.toBe(financeDiagnostic.fingerprint);
    expect(JSON.stringify([rentalDiagnostic, financeDiagnostic])).not.toMatch(
      /secret-rental|0900123456|\/app\//,
    );
  });

  it('does not use error messages in diagnostic fingerprints', () => {
    const first = Object.assign(new Error('token=secret-A'), { code: 'P2034' });
    Object.defineProperty(first, 'stack', {
      value: 'Error: token=secret-A\n    at fn (/app/src/modules/rentals/rental.service.ts:10:5)',
    });
    const second = Object.assign(new Error('phone=0900123456 secret-B'), { code: 'P2034' });
    Object.defineProperty(second, 'stack', {
      value:
        'Error: phone=0900123456 secret-B\n    at fn (/app/src/modules/rentals/rental.service.ts:10:5)',
    });

    const firstDiagnostic = safeErrorDiagnostic(first);
    const secondDiagnostic = safeErrorDiagnostic(second);

    expect(firstDiagnostic.fingerprint).toBe(secondDiagnostic.fingerprint);
    expect(JSON.stringify([firstDiagnostic, secondDiagnostic])).not.toMatch(
      /secret-A|secret-B|0900123456/,
    );
  });

  it('accepts reviewed machine codes and classifies a bounded Error cause', () => {
    for (const code of [
      'P2034',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ERR_STREAM_PREMATURE_CLOSE',
      'ABORT_ERR',
    ]) {
      expect(safeErrorDiagnostic(Object.assign(new Error('secret'), { code })).errorCode).toBe(
        code,
      );
    }
    for (const code of [
      'secret token value',
      'https://user:pass@host',
      'a'.repeat(65),
      'P2034\n',
    ]) {
      expect(
        safeErrorDiagnostic(Object.assign(new Error('secret'), { code })).errorCode,
      ).toBeUndefined();
    }

    const cause = Object.assign(new Error('SELECT * FROM customers WHERE phone=0900123456'), {
      code: 'ECONNREFUSED',
    });
    const diagnostic = safeErrorDiagnostic(new Error('outer secret', { cause }));
    expect(diagnostic).toMatchObject({
      causeCategory: 'network',
      causeType: 'Error',
      causeCode: 'ECONNREFUSED',
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/SELECT|0900123456|outer secret/);

    class PrismaClientInitializationError extends Error {}
    expect(
      safeErrorDiagnostic(
        new Error('outer', { cause: new PrismaClientInitializationError('postgres://secret') }),
      ),
    ).toMatchObject({ causeCategory: 'database', causeType: 'PrismaClientInitializationError' });
  });

  it('fails closed for malformed stacks and circular causes', () => {
    const malformed = new Error('secret');
    Object.defineProperty(malformed, 'stack', {
      get: () => {
        throw new Error('stack secret');
      },
    });
    Object.defineProperty(malformed, 'cause', { value: malformed });

    expect(() => safeErrorDiagnostic(malformed)).not.toThrow();
    const diagnostic = safeErrorDiagnostic(malformed);
    expect(diagnostic.errorType).toBe('Error');
    expect(diagnostic.fingerprint).toMatch(/^v1:(?:[a-f0-9]{24}|fallback-[a-f0-9]{8})$/);
  });

  it('writes parseable JSON and does not forward raw error stacks', () => {
    const output: string[] = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    const logger = new ApplicationLogger('log');
    logger.log({ event: 'test', password: 'sensitive' });
    const failure = new Error(
      'SELECT * FROM customers WHERE phone=0900123456 token=secret postgres://user:password@db.internal:5432/app',
    );
    Object.defineProperty(failure, 'stack', {
      value:
        'Error: SELECT * FROM customers WHERE phone=0900123456 token=secret postgres://user:password@db.internal:5432/app\n    at fn (/app/src/modules/rentals/rental.service.ts:10:5)',
    });
    logger.error(
      {
        event: 'failure',
        error: failure,
        email: 'user@example.com',
        address: '1 Private Street',
        body: { phone: '0900123456' },
        headers: { authorization: 'Bearer secret' },
      },
      'sensitive stack',
      'Test',
    );
    logger.debug('hidden');
    expect(output).toHaveLength(2);
    for (const line of output) {
      expect(() => {
        JSON.parse(line);
      }).not.toThrow();
      expect(line).not.toContain('sensitive');
      expect(line).not.toMatch(
        /SELECT|0900123456|user@example.com|1 Private Street|secret|postgres:\/\//,
      );
    }
    const structuredOutput: unknown = JSON.parse(output[1] ?? '{}');
    expect(structuredOutput).toMatchObject({
      message: {
        event: 'failure',
        error: {
          errorType: 'Error',
          frames: ['src/modules/rentals/rental.service.ts:10'],
        },
      },
    });
    expect(JSON.stringify(structuredOutput)).toMatch(/"fingerprint":"v1:[a-f0-9]{24}"/);
  });

  it('adds the active request ID to structured application logs', () => {
    const output: string[] = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    withRequestContext({ requestId: 'request-correlation-1' }, () => {
      new ApplicationLogger('log').log({ event: 'business.operation.completed' });
    });
    expect(JSON.parse(output[0] ?? '{}')).toMatchObject({
      message: {
        event: 'business.operation.completed',
        requestId: 'request-correlation-1',
      },
    });
  });

  it('enriches background error events with safe diagnostics and the active request ID', () => {
    const output: string[] = [];
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    const error = new Error('Bearer secret phone=0900123456');
    Object.defineProperty(error, 'stack', {
      value:
        'Error: Bearer secret phone=0900123456\n    at fn (/app/src/modules/audit/application/audit.service.ts:40:5)',
    });

    withRequestContext({ requestId: 'request-audit-failure' }, () => {
      new ApplicationLogger('log').error(
        { event: 'audit.persist.failed', error },
        undefined,
        'Audit',
      );
    });

    const line = output[0] ?? '';
    expect(line).not.toMatch(/secret|0900123456/);
    const structuredOutput: unknown = JSON.parse(line);
    expect(structuredOutput).toMatchObject({
      message: {
        event: 'audit.persist.failed',
        requestId: 'request-audit-failure',
        error: {
          errorType: 'Error',
          frames: ['src/modules/audit/application/audit.service.ts:40'],
        },
      },
    });
    expect(JSON.stringify(structuredOutput)).toMatch(/"fingerprint":"v1:[a-f0-9]{24}"/);
  });

  it.each([
    ['valid-request_123', true],
    ['invalid request', false],
    ['a'.repeat(101), false],
  ])('validates request ID %s', (incoming, accepted) => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const response = Object.assign(new EventEmitter(), {
      statusCode: 201,
      writableFinished: true,
      setHeader: jest.fn(),
    });
    const request = {
      header: () => incoming,
      method: 'POST',
      route: { path: '/api/v1/auth/login' },
      url: '/api/v1/auth/login?password=sensitive',
      body: { password: 'sensitive' },
    } as unknown as Request;
    const next = jest.fn();
    new RequestContextMiddleware().use(request, response as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.requestId === incoming).toBe(accepted);
    expect(request.requestId).toMatch(/^[a-zA-Z0-9_-]{1,100}$/);
    response.emit('finish');
    response.emit('close');
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.login',
        outcome: 'success',
        requestId: request.requestId,
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive');
  });

  it('records failed auth and aborted requests at the appropriate level', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const request = {
      header: () => undefined,
      method: 'POST',
      route: { path: '/api/v1/auth/refresh' },
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      statusCode: 401,
      writableFinished: true,
      setHeader: jest.fn(),
    });
    new RequestContextMiddleware().use(request, response as unknown as Response, jest.fn());
    response.emit('finish');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.refresh', outcome: 'failure', statusCode: 401 }),
    );
    const aborted = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: false,
      setHeader: jest.fn(),
    });
    new RequestContextMiddleware().use(request, aborted as unknown as Response, jest.fn());
    aborted.emit('close');
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.refresh', outcome: 'aborted', aborted: true }),
    );
  });
});
