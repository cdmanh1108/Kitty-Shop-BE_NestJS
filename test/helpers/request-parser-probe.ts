import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { once } from 'node:events';
import { request, type IncomingMessage, type Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { deflateSync, gzipSync } from 'node:zlib';
import { Body, Controller, Get, Module, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { AppConfiguration } from '../../src/config/configuration';
import { configureApplication } from '../../src/configure-application';

// Run in a child process: an unhandled decompression error must fail this probe,
// not terminate Jest. This module never imports AppModule or connects to a DB.
let sendTrailingBytes: (() => void) | undefined;

@Controller('parser-probe')
class ParserProbeController {
  @Post()
  async echo(@Body() body: object, @Req() incoming: IncomingMessage) {
    if (sendTrailingBytes) {
      const finished = once(incoming, 'end');
      const finish = sendTrailingBytes;
      sendTrailingBytes = undefined;
      finish();
      await finished;
    }
    return body;
  }

  @Get()
  healthy() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [ParserProbeController],
  providers: [
    {
      provide: ConfigService,
      useValue: new ConfigService<AppConfiguration, true>({
        apiPrefix: 'api/v1',
        corsOrigins: [],
        trustProxy: false,
        swaggerEnabled: false,
      }),
    },
  ],
})
class ParserProbeModule {}

async function probe(): Promise<void> {
  const mode = process.argv[2];
  assert.ok(mode === 'normal' || mode === 'trailing' || mode === 'gzip-trailing');
  const app = await NestFactory.create(ParserProbeModule, { logger: false });
  try {
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as Server;
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const port = address.port;

    function send(
      method: 'GET' | 'POST',
      body?: Buffer,
      encoding?: string,
      trailing?: Buffer,
    ): Promise<{ status: number | undefined; body: string }> {
      return new Promise((resolve, reject) => {
        const outgoing = request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/api/v1/parser-probe',
            method,
            agent: false,
            headers: {
              'Content-Type': 'application/json',
              ...(encoding ? { 'Content-Encoding': encoding } : {}),
              ...(body ? { 'Content-Length': body.length + (trailing?.length ?? 0) } : {}),
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('error', reject);
            response.on('end', () =>
              resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }),
            );
          },
        );
        outgoing.on('error', reject);
        outgoing.setTimeout(3000, () => outgoing.destroy(new Error('Parser probe timed out')));
        if (trailing) {
          // Send the final bytes only after Nest has parsed the complete deflate
          // frame and entered the handler, while the HTTP body is still open.
          sendTrailingBytes = () => outgoing.end(trailing);
          outgoing.write(body);
        } else {
          outgoing.end(body);
        }
      });
    }

    const body = Buffer.from('{"message":"ok"}');
    if (mode === 'normal') {
      assert.deepEqual(await send('POST', body), { status: 201, body: body.toString() });
      assert.deepEqual(await send('POST', gzipSync(body), 'gzip'), {
        status: 201,
        body: body.toString(),
      });
    } else if (mode === 'trailing') {
      const first = Buffer.concat([deflateSync(body), Buffer.from([0])]);
      assert.deepEqual(await send('POST', first, 'deflate', Buffer.alloc(1024)), {
        status: 201,
        body: body.toString(),
      });
    } else {
      // A larger HTTP body delivers more bytes after gzip has already finished
      // decoding. Keep the child alive long enough to observe delayed errors.
      const encoded = Buffer.concat([
        gzipSync(body),
        Buffer.from([0]),
        Buffer.alloc(100 * 1024, 0x58),
      ]);
      assert.deepEqual(await send('POST', encoded, 'gzip'), {
        status: 201,
        body: body.toString(),
      });
      await delay(200);
    }

    assert.deepEqual(await send('GET'), { status: 200, body: '{"status":"ok"}' });
    process.stdout.write(`request-parser-probe:passed:${mode}\n`);
  } finally {
    await app.close();
  }
}

void probe().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
