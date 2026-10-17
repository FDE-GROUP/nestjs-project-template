import { createRootRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl p-6 font-sans text-slate-800">
      <header className="mb-8 flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            SaaS Console
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link to="/workspaces" className="hover:text-slate-900">
              Workspaces
            </Link>
            <Link to="/settings/members" className="hover:text-slate-900">
              成员
            </Link>
          </nav>
        </div>
        <span className="text-xs text-slate-400">F2 自助面 · apps/web</span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
