import { homedir } from 'node:os';
import { join } from 'node:path';
import { openStore, invalid } from './lib/store.js';
import { catalog } from './lib/sessions.js';

export const name = 'session-labels';
export const ROUTE = '/youxia-session-labels/api';
export function authorize(ctx, req) {
  const connection = ctx.get('connection');
  if (!connection?.admit) throw invalid('认证服务不可用', 503);
  const admission = connection.admit(req);
  if (!admission || 'rejection' in admission || admission.peer?.principal?.kind !== 'owner') throw invalid('仅限已认证的 owner', 403);
}
async function body(req) {
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw invalid('只接受 application/json', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw invalid('请求体过大', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw invalid('JSON 格式错误'); }
}
export function handler(ctx, store) {
  return async (req, res) => {
    let status = 200, payload;
    try {
      authorize(ctx, req);
      if (req.method === 'GET') payload = store.snapshot();
      else if (req.method === 'POST') payload = store.mutate(await body(req));
      else throw invalid('不支持此请求方法', 405);
      if (payload && !payload.error) payload.sessions = catalog(process.env.DSH_HOME || join(homedir(), '.dsh'), Object.keys(payload.assignments || {}));
    } catch (error) {
      status = error.status ?? 500;
      payload = { error: status === 500 ? '标签存储读写失败，原数据未被覆盖。请检查磁盘与 Host 日志。' : error.message };
      if (status === 500) console.error('[dsh-session-labels]', error);
    }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(payload));
  };
}
export function apply(ctx) {
  ctx.inject(['webServer', 'connection'], scoped => {
    scoped.effect(() => {
      const store = openStore(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'session-labels', 'labels.sqlite'));
      const stop = scoped.webServer.register({ kind: 'exact', path: ROUTE, handler: handler(scoped, store) });
      return () => { stop(); store.close(); };
    });
  });
}
