// Weekly digest: new connections, posts from connections, new events with open deadlines.
// buildDigest is pure (tested); gatherDigestData reads Supabase; sendEmail posts to Resend when configured.
import { config } from '../config/env.js';
import { getSupabase, isSupabaseReady } from '../db/supabase.js';

const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'TBA');

/** Pure. data = { name, newConnections:[{name,institution}], pendingRequests:n, posts:[{author_name,content,created_at}],
 *  events:[{id,title,deadline,start_date,city,country}] } -> { subject, html, text, empty } */
export function buildDigest(data, { siteUrl = '', now = new Date() } = {}) {
  const { name = '', newConnections = [], pendingRequests = 0, posts = [], events = [] } = data;
  const link = (path) => (siteUrl ? `${siteUrl}${path}` : path);
  const empty = !newConnections.length && !pendingRequests && !posts.length && !events.length;
  const week = `${fmtDay(new Date(now.getTime() - 7 * DAY).toISOString())} – ${fmtDay(now.toISOString())}`;
  const subject = empty ? 'Your Researchly week' :
    `Your Researchly week: ${[events.length && `${events.length} new event${events.length > 1 ? 's' : ''}`,
      newConnections.length && `${newConnections.length} new connection${newConnections.length > 1 ? 's' : ''}`,
      posts.length && `${posts.length} post${posts.length > 1 ? 's' : ''} from your network`].filter(Boolean).join(', ')}`;

  const text = [];
  const html = [];
  const section = (title, items, renderHtml, renderText) => {
    if (!items.length) return;
    text.push(`\n${title}`, ...items.map((i) => `- ${renderText(i)}`));
    html.push(`<h2 style="font:600 16px/1.3 Georgia,serif;margin:24px 0 8px">${esc(title)}</h2><ul style="padding-left:18px;margin:0">${items.map((i) => `<li style="margin:0 0 8px">${renderHtml(i)}</li>`).join('')}</ul>`);
  };
  section('New connections', newConnections,
    (c) => `<strong>${esc(c.name)}</strong>${c.institution ? ` · ${esc(c.institution)}` : ''}`,
    (c) => `${c.name}${c.institution ? ` (${c.institution})` : ''}`);
  if (pendingRequests) {
    text.push(`\nYou have ${pendingRequests} pending connection request(s): ${link('/network')}`);
    html.push(`<p style="margin:16px 0">You have <strong>${pendingRequests}</strong> pending connection request${pendingRequests > 1 ? 's' : ''}. <a href="${esc(link('/network'))}">Review them</a></p>`);
  }
  const snip = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 180 ? `${t.slice(0, 177)}…` : t; };
  section('From your network', posts.slice(0, 5),
    (p) => `<strong>${esc(p.author_name)}</strong>: ${esc(snip(p.content))}`,
    (p) => `${p.author_name}: ${snip(p.content)}`);
  const where = (e) => [e.city, e.country].filter(Boolean).join(', ');
  section('New events with open deadlines', events.slice(0, 8),
    (e) => `<a href="${esc(link(`/conferences/${encodeURIComponent(e.id)}`))}"><strong>${esc(e.title)}</strong></a><br><span style="color:#555">Deadline ${esc(fmtDay(e.deadline))}${e.start_date ? ` · Starts ${esc(fmtDay(e.start_date))}` : ''}${where(e) ? ` · ${esc(where(e))}` : ''}</span>`,
    (e) => `${e.title}: deadline ${fmtDay(e.deadline)}${where(e) ? `, ${where(e)}` : ''} ${link(`/conferences/${encodeURIComponent(e.id)}`)}`);
  if (empty) {
    text.push('\nA quiet week: no new connections, posts or events. Explore upcoming deadlines on Researchly.');
    html.push(`<p>A quiet week: no new connections, posts or events. <a href="${esc(link('/discover'))}">Explore upcoming deadlines</a>.</p>`);
  }
  const unsub = link('/profile');
  const greeting = `Hi ${name || 'there'},`;
  return {
    subject, empty,
    text: `${greeting}\nHere is your Researchly summary for ${week}.\n${text.join('\n')}\n\nManage or stop this email: ${unsub}\n`,
    html: `<div style="max-width:560px;margin:0 auto;font:14px/1.55 -apple-system,Segoe UI,Arial,sans-serif;color:#1d1f23">
<p>${esc(greeting)}</p><p style="color:#555">Your Researchly summary for ${esc(week)}.</p>${html.join('')}
<p style="margin-top:32px;font-size:12px;color:#777">You receive this because you turned on the weekly digest. <a href="${esc(unsub)}">Manage or unsubscribe</a>.</p></div>`
  };
}

/** Collect digest inputs for one user from Supabase (since = Date). */
export async function gatherDigestData(userId, since) {
  const sb = getSupabase();
  const sinceIso = since.toISOString();
  const { data: profile } = await sb.from('profiles').select('id, full_name, email').eq('id', userId).maybeSingle();

  const { data: conns } = await sb.from('colleague_connections')
    .select('user_id, target_user_id, status, created_at, updated_at')
    .or(`user_id.eq.${userId},target_user_id.eq.${userId}`);
  const other = (c) => (c.user_id === userId ? c.target_user_id : c.user_id);
  const connected = (conns || []).filter((c) => c.status === 'connected');
  const fresh = connected.filter((c) => (c.updated_at || c.created_at) >= sinceIso);
  const pendingRequests = (conns || []).filter((c) => c.status === 'pending' && c.target_user_id === userId).length;

  let newConnections = [];
  if (fresh.length) {
    const { data: ps } = await sb.from('profiles').select('id, full_name, institution').in('id', fresh.map(other));
    newConnections = (ps || []).map((p) => ({ name: p.full_name, institution: p.institution }));
  }

  let posts = [];
  const ids = connected.map(other);
  if (ids.length) {
    const { data } = await sb.from('posts').select('author_name, content, created_at, visibility')
      .in('user_id', ids).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(5);
    posts = data || [];   // connections may see both public and connections-only posts
  }

  const nowIso = new Date().toISOString();
  const { data: confs } = await sb.from('conferences')
    .select('id, title, name, edition, submission_deadline, start_date, city, country, created_at')
    .gte('created_at', sinceIso).gte('submission_deadline', nowIso.slice(0, 10)).order('submission_deadline', { ascending: true }).limit(8);
  const events = (confs || []).map((c) => ({ ...c, deadline: c.submission_deadline, title: c.title || `${c.name} ${c.edition || ''}`.trim() }));

  return { profile, data: { name: profile?.full_name, newConnections, pendingRequests, posts, events } };
}

export async function sendEmail({ to, subject, html, text }) {
  if (!config.resendApiKey || !config.newsletterFrom) return { sent: false, reason: 'RESEND_API_KEY / NEWSLETTER_FROM not set (dry run)' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.newsletterFrom, to: [to], subject, html, text })
  });
  if (!r.ok) return { sent: false, reason: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { sent: true };
}

/** Send to every opted-in profile not mailed in the last 6 days. */
export async function sendWeeklyDigests({ dryRun = false, now = new Date() } = {}) {
  if (!isSupabaseReady()) return { error: 'Supabase not configured' };
  const sb = getSupabase();
  const since = new Date(now.getTime() - 7 * DAY);
  const { data: subs, error } = await sb.from('profiles').select('id, email, newsletter_last_sent_at').eq('newsletter_opt_in', true);
  if (error) return { error: error.message };
  const report = { recipients: subs.length, sent: 0, skipped: 0, failed: [], dry_run: dryRun || !config.resendApiKey };
  for (const s of subs) {
    if (!s.email || (s.newsletter_last_sent_at && now - new Date(s.newsletter_last_sent_at) < 6 * DAY)) { report.skipped++; continue; }
    const { data } = await gatherDigestData(s.id, since);
    const digest = buildDigest(data, { siteUrl: config.siteUrl, now });
    if (report.dry_run) { report.skipped++; continue; }
    const r = await sendEmail({ to: s.email, ...digest });
    if (r.sent) {
      report.sent++;
      await sb.from('profiles').update({ newsletter_last_sent_at: now.toISOString() }).eq('id', s.id);
    } else report.failed.push(r.reason);    // never echo addresses back
  }
  return report;
}
