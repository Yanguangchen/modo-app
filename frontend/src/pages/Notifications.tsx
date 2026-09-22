import { Icon } from '../components/Icon'
import { Segmented } from '../components/ui'
import { syncNotificationToRobot } from '../lib/robotSync'
import { useStore } from '../lib/store'

export default function Notifications() {
  const { notifications, prefs, setPrefs, addNotification, markNotificationRead, clearReadNotifications, notify } = useStore()
  const unread = notifications.filter(n => !n.read)

  const createTestNotification = async () => {
    const notification = addNotification({
      title: 'Test reminder sent',
      message: 'Modo would say: "It is time to start your next block. Let us begin with one small step."',
      kind: 'reminder',
      priority: 'normal',
    })
    const synced = await syncNotificationToRobot(notification)
    notify(synced ? 'Test alert synced to robot bridge' : 'Test alert created. Start backend to sync robot.')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>Reminders stay visible here, with delivery settings tuned for your focus state.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={createTestNotification}>
          <Icon name="sparkle" size={18} />
          Send test alert
        </button>
      </div>

      <div className="grid notifications-layout">
        <section className="glass card stack">
          <div className="row-between">
            <div className="row">
              <span className="calendar-icon"><Icon name="bell" /></span>
              <div>
                <h2>Notification Center</h2>
                <p className="muted">{unread.length ? `${unread.length} unread reminder${unread.length === 1 ? '' : 's'}` : 'All caught up'}</p>
              </div>
            </div>
            <div className="row">
              <span className="badge">All {notifications.length}</span>
              <span className="badge badge-accent">Unread {unread.length}</span>
              <button type="button" className="btn btn-sm" onClick={clearReadNotifications}>Clear read</button>
            </div>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="empty-state">
                <Icon name="inbox" size={34} />
                <h3>No notifications yet</h3>
                <button type="button" className="btn" onClick={createTestNotification}>
                  <Icon name="sparkle" size={18} />
                  Create test notification
                </button>
              </div>
            ) : notifications.map(item => (
              <button
                key={item.id}
                type="button"
                className={`notification-row${item.read ? '' : ' is-unread'}`}
                onClick={() => markNotificationRead(item.id)}
              >
                <span className={`notification-dot is-${item.priority}`} />
                <span className="stack-sm">
                  <strong>{item.title}</strong>
                  <span className="muted">{item.message}</span>
                </span>
                <span className="badge">{item.kind}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="glass card stack sticky-wide">
          <div className="section-title">
            <h2><Icon name="settings" /> Notification Preferences</h2>
          </div>
          <p className="muted">Stay informed on important updates without interrupting your flow state.</p>

          <div className="field">
            <label>Remind before block starts</label>
            <Segmented
              label="Reminder lead time"
              value={String(prefs.reminderMinutesBefore)}
              onChange={v => setPrefs({ reminderMinutesBefore: Number(v) })}
              options={[
                { value: '5', label: '5 mins' },
                { value: '10', label: '10 mins' },
                { value: '15', label: '15 mins' },
              ]}
            />
          </div>

          <div className="field">
            <label>Assistant style</label>
            <Segmented
              label="Assistant reminder style"
              value={prefs.reminderStyle}
              onChange={v => setPrefs({ reminderStyle: v })}
              options={[
                { value: 'gentle', label: 'Gentle' },
                { value: 'direct', label: 'Direct' },
                { value: 'minimal', label: 'Minimal' },
              ]}
            />
          </div>

          <div className="preference-group">
            <span className="faint">Delivery channels</span>
            <Toggle label="In-app toasts" hint="Show popup toasts within Modo" checked={prefs.inAppToasts} onChange={inAppToasts => setPrefs({ inAppToasts })} />
            <Toggle label="Browser push" hint="Alerts when running in background tabs" checked={prefs.browserPush} onChange={browserPush => setPrefs({ browserPush })} />
            <Toggle label="Gentle chime" hint="Soft audio cue before reminders" checked={prefs.gentleChime} onChange={gentleChime => setPrefs({ gentleChime })} />
          </div>

          <div className="preference-group">
            <span className="faint">Focus protection</span>
            <Toggle label="Do Not Disturb in Deep Work" hint="Only deliver high-priority urgent alerts" checked={prefs.focusProtection} onChange={focusProtection => setPrefs({ focusProtection })} />
            <Toggle label="Mute during Breaks & Sleep" hint="Keep quiet during recovery intervals" checked={prefs.muteDuringBreaks} onChange={muteDuringBreaks => setPrefs({ muteDuringBreaks })} />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="switch">
      <span>
        <strong>{label}</strong>
        <span className="hint">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden />
    </label>
  )
}
