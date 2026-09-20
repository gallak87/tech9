const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );

// Presentation state only; expiration never rerenders the underlying dialog.
export class DialogNotifications {
  constructor(onClear, timers = globalThis) {
    this.onClear = onClear;
    this.timers = timers;
    this.current = null;
  }
  clear() {
    this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.onClear?.();
  }
  show(result, context) {
    this.clear();
    if (!result.message) return;
    const current = {
      message: result.message,
      ok: result.ok !== false,
      context,
      duration: result.message.length > 120 ? 6000 : 3600,
    };
    this.current = current;
    if (current.ok) {
      this.timer = this.timers.setTimeout(() => {
        if (this.current === current) this.clear();
      }, current.duration);
      this.timer?.unref?.();
    }
  }
  retain(context) {
    if (this.current && this.current.context !== context) this.clear();
  }
}

export function notificationMarkup(notifications) {
  const result = notifications?.current;
  if (!result) return '';
  return `<aside class="ui-toast${result.ok ? '' : ' ui-toast-error'}" data-feedback style="--feedback-duration:${result.duration}ms"><span role="${result.ok ? 'status' : 'alert'}" aria-atomic="true">${esc(result.message)}</span>${result.ok ? '' : '<button class="ui-toast-dismiss" data-do="dismiss-feedback" aria-label="Dismiss notification">×</button>'}</aside>`;
}
