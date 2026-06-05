/* Last-seen timestamp formatting — all output is English locale. */

export function formatLastSeen(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return 'Offline';

  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return 'Offline';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  if (date >= startOfToday) {
    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `Last seen today at ${time}`;
  }

  if (date >= startOfYesterday) {
    return 'Last seen yesterday';
  }

  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Last seen ${formatted}`;
}
