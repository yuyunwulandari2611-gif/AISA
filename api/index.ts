import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../src/server/app.ts';

const app = createApiApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
