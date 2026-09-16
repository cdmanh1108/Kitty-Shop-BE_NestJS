import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { ApplicationLogger, redactLog } from '../src/common/logging/application-logger';
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
    logger.error({ event: 'failure', error: new Error('sensitive') }, 'sensitive stack', 'Test');
    logger.debug('hidden');
    expect(output).toHaveLength(2);
    for (const line of output) {
      expect(() => {
        JSON.parse(line);
      }).not.toThrow();
      expect(line).not.toContain('sensitive');
    }
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
