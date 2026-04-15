'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { NotificationRow } from '@/lib/types';
import { fmtRelative } from '@/lib/format';

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (mounted) setItems((data as NotificationRow[]) ?? []);
    }
    load();

    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'carscout', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as NotificationRow, ...prev].slice(0, 10)),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative px-3 py-2 rounded-md hover:bg-surface border border-transparent hover:border-border"
        aria-label="Notificaties"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute top-1 right-1 bg-bad text-bg text-[10px] font-mono w-4 h-4 rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 card p-2 shadow-lg z-50">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs uppercase tracking-wider text-muted font-mono">
              Notificaties
            </span>
            {unread > 0 && (
              <span className="text-xs text-muted">{unread} ongelezen</span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted">
                Geen notificaties.
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={
                  'w-full text-left px-3 py-2 rounded hover:bg-bg/40 mb-1 ' +
                  (!n.read ? 'border-l-2 border-accent' : '')
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{iconFor(n.type)}</span>
                  <span className="text-sm font-medium truncate">{n.title}</span>
                </div>
                <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-muted/70 mt-1 font-mono">
                  {fmtRelative(n.created_at)}
                </p>
              </button>
            ))}
          </div>
          <Link
            href="/alerts"
            className="block text-center text-xs text-accent py-2 border-t border-border mt-1"
          >
            Bekijk alle alerts →
          </Link>
        </div>
      )}
    </div>
  );
}

function iconFor(type: string | null): string {
  switch (type) {
    case 'alert': return '🚗';
    case 'price_drop': return '💰';
    case 'system': return '⚙️';
    case 'high_score': return '⭐';
    default: return '📬';
  }
}
