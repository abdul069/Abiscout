import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { chat_id } = await req.json();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'Bot not configured' }, { status: 500 });
  if (!chat_id) return NextResponse.json({ error: 'chat_id required' }, { status: 400 });

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text: '✅ *CarScout test*\nJe Telegram is succesvol gekoppeld. Vanaf nu krijg je hier alerts.',
      parse_mode: 'Markdown',
    }),
  });

  const json = await res.json();
  if (!json.ok) {
    return NextResponse.json(
      { ok: false, error: json.description ?? 'Telegram error' },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
