import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { getSession, type SessionResult, signOut } from '../lib/auth';

export const Route = createFileRoute('/')({
  // 未登录直接弹回登录页（deny-by-default 的前端映射·与后端会话墙同向）。
  loader: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
    return session;
  },
  component: DashboardPage,
});

function DashboardPage() {
  const session = Route.useLoaderData() as SessionResult;
  const navigate = useNavigate();

  async function onSignOut() {
    await signOut();
    await navigate({ to: '/login' });
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">当前会话</h1>
      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 rounded-lg border border-slate-200 p-4 text-sm">
        <dt className="text-slate-500">邮箱</dt>
        <dd data-testid="session-email">{session.user.email}</dd>
        <dt className="text-slate-500">用户 ID</dt>
        <dd>{session.user.id}</dd>
      </dl>
      <div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          登出
        </button>
      </div>
    </section>
  );
}
