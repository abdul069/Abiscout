'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { CarscoutUser } from '@/lib/types';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '◐' },
  { href: '/searches', label: 'Zoekopdrachten', icon: '◇' },
  { href: '/listings', label: 'Listings', icon: '▤' },
  { href: '/alerts', label: 'Alerts', icon: '⚡' },
  { href: '/market', label: 'Markt', icon: '◧' },
  { href: '/approvals', label: 'Advertenties', icon: '✎' },
  { href: '/saved', label: 'Bewaard', icon: '★' },
  { href: '/settings', label: 'Instellingen', icon: '⚙' },
];

export default function Sidebar({ user }: { user: CarscoutUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-60 bg-surface border-r border-border h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="font-mono text-lg font-semibold tracking-tight">
          Car<span className="text-accent">Scout</span>
        </div>
        <div className="mt-1 text-xs text-muted font-mono">
          {user.company || user.email}
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition mb-0.5 ' +
                (active
                  ? 'bg-accent/10 text-accent'
                  : 'text-text/80 hover:bg-bg/50 hover:text-text')
              }
            >
              <span className="font-mono text-base w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center justify-between mb-3 px-2">
          <span className="text-xs uppercase tracking-wider text-muted font-mono">
            Plan
          </span>
          <span className={`badge ${planBadge(user.plan)}`}>{user.plan}</span>
        </div>
        <button onClick={signOut} className="btn btn-secondary w-full text-xs">
          Uitloggen
        </button>
      </div>
    </aside>
  );
}

function planBadge(plan: string): string {
  switch (plan) {
    case 'business': return 'badge-amber';
    case 'pro': return 'badge-good';
    case 'starter': return 'badge-info';
    default: return 'badge-warn';
  }
}
