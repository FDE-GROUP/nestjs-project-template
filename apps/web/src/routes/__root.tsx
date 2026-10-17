import { createRootRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl p-6 font-sans text-slate-800">
      <header className="mb-8 flex items-center justify-between border-b border-slate-200 pb-3">
        <Link to="/" className="text-lg font-semibold">
          SaaS Console
        </Link>
        <span className="text-xs text-slate-400">F0 骨架 · apps/web</span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
