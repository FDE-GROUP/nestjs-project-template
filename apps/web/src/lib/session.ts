import { redirect } from '@tanstack/react-router';
import { getSession, type SessionResult } from './auth';

/**
 * 受保护页的统一会话守卫（deny-by-default 的前端映射·与后端会话墙同向）。
 * 无有效会话 → 弹回登录页；各自助面 loader 首行调用，再取 typed 数据。
 */
export async function requireSession(): Promise<SessionResult> {
  const session = await getSession();
  if (!session) throw redirect({ to: '/login' });
  return session;
}
