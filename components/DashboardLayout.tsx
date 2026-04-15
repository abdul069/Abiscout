import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import type { CarscoutUser } from '@/lib/types';

interface Props {
  user: CarscoutUser;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function DashboardLayout({ user, title, action, children }: Props) {
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-bg/85 backdrop-blur border-b border-border">
          <div className="px-8 py-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <div className="flex items-center gap-3">
              {action}
              <NotificationBell userId={user.id} />
            </div>
          </div>
        </header>
        <div className="px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
