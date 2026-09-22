import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Disclose, PrivateChip, Segmented } from '../components/ui'
import { playAudio } from '../lib/audio'
import { useStore } from '../lib/store'
import type { MotionPref, Theme } from '../lib/types'

interface SettingCardProps {
  id: string
  title: string
  icon: IconName
  summary: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

function SettingCard({
  id,
  title,
  icon,
  summary,
  open,
  onToggle,
  children,
}: SettingCardProps) {
  return (
    <section className={`glass card rise${open ? ' is-open' : ''}`} aria-labelledby={`card-h-${id}`}>
      <button
        type="button"
        className="row-between"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={open}
        aria-controls={`card-body-${id}`}
        onClick={onToggle}
      >
        <div className="row" style={{ gap: 'var(--s3)' }}>
          <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Icon name={icon} size={20} /></span>
          <h2 id={`card-h-${id}`} style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>{title}</h2>
        </div>
        <div className="row" style={{ gap: 'var(--s2)' }}>
          <span className="badge" style={{ fontWeight: 550 }}>{summary}</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              transition: 'transform var(--dur-2) var(--ease)',
              transform: open ? 'rotate(180deg)' : 'none',
              color: 'var(--text-muted)',
            }}
            aria-hidden
          >
            <Icon name="chevronDown" size={18} />
          </span>
        </div>
      </button>

      <Disclose open={open} id={`card-body-${id}`}>
        <div className="stack" style={{ paddingTop: 'var(--s4)' }}>
          {children}
        </div>
      </Disclose>
    </section>
  )
}

export default function Settings() {
  const { prefs, setPrefs, reset, notify } = useStore()
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({
    sensory: false,
    schedule: false,
    privacy: false,
  })

  const toggleCard = (id: string) => {
    playAudio('tack')
    setOpenCards(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const exportData = () => {
    try {
      const raw = localStorage.getItem('clarity.v1')
      const blob = new Blob([raw || '{}'], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clarity-workspace-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      notify('Export downloaded successfully')
    } catch {
      notify('Failed to generate export file')
    }
  }

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset your local data? This cannot be undone.')) {
      reset()
      notify('All local data and preferences have been reset')
    }
  }

  const sensorySummary = `${prefs.theme === 'system' ? 'System theme' : prefs.theme} · ${prefs.motion === 'system' ? 'System motion' : `${prefs.motion} motion`}`
  const scheduleSummary = `${prefs.bufferMinutes}m buffer · Quiet ${prefs.quietStart}–${prefs.quietEnd}`

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings & Preferences</h1>
          <p>Customize your sensory preferences, interface density, quiet hours, and data privacy.</p>
        </div>
        <PrivateChip text="All preferences stored locally" />
      </div>

      <div className="stack">
        {/* Card 1: Sensory & Display */}
        <SettingCard
          id="sensory"
          title="Sensory & Display"
          icon="sparkle"
          summary={sensorySummary}
          open={!!openCards.sensory}
          onToggle={() => toggleCard('sensory')}
        >
          <div className="field">
            <label>Interface Theme</label>
            <Segmented<Theme>
              label="Theme"
              value={prefs.theme}
              onChange={theme => setPrefs({ theme })}
              options={[
                { value: 'system', label: 'Match system' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>

          <div className="field">
            <label>Motion & Transitions</label>
            <Segmented<MotionPref>
              label="Motion"
              value={prefs.motion}
              onChange={motion => setPrefs({ motion })}
              options={[
                { value: 'system', label: 'Match system' },
                { value: 'reduced', label: 'Reduced motion' },
                { value: 'full', label: 'Full motion' },
              ]}
            />
            <span className="hint">Reduced motion disables background drift, card animations, and sliding pills.</span>
          </div>

          <div className="field">
            <label>Surface Style</label>
            <Segmented<string>
              label="Surfaces"
              value={prefs.solidSurfaces ? 'solid' : 'glass'}
              onChange={v => setPrefs({ solidSurfaces: v === 'solid' })}
              options={[
                { value: 'glass', label: 'Soft glass' },
                { value: 'solid', label: 'Solid surfaces (reduced transparency)' },
              ]}
            />
          </div>

          <div className="field">
            <label>Information Density</label>
            <Segmented<'comfortable' | 'compact'>
              label="Density"
              value={prefs.density}
              onChange={density => setPrefs({ density })}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
          </div>

          <div className="field">
            <label>Typography</label>
            <Segmented<'system' | 'atkinson'>
              label="Font"
              value={prefs.font}
              onChange={font => setPrefs({ font })}
              options={[
                { value: 'system', label: 'System sans-serif' },
                { value: 'atkinson', label: 'Atkinson Hyperlegible' },
              ]}
            />
            <span className="hint">Atkinson Hyperlegible focuses on letterform distinction to increase legibility.</span>
          </div>

          <div className="field" style={{ maxWidth: 300 }}>
            <label htmlFor="pref-scale">Text size scale: {Math.round(prefs.textScale * 100)}%</label>
            <input
              id="pref-scale"
              type="range"
              min="0.9"
              max="1.25"
              step="0.05"
              value={prefs.textScale}
              onChange={e => setPrefs({ textScale: parseFloat(e.target.value) })}
            />
          </div>

          <hr className="divider" />

          {/* Sound & Audio Sensory Controls */}
          <div className="field">
            <label>Audio & Sound Feedback</label>
            <Segmented<string>
              label="Audio feedback"
              value={prefs.soundEnabled ? 'on' : 'off'}
              onChange={v => {
                const enabled = v === 'on'
                setPrefs({ soundEnabled: enabled })
                playAudio(enabled ? 'beep' : 'boop')
              }}
              options={[
                { value: 'on', label: 'Sound on' },
                { value: 'off', label: 'Muted' },
              ]}
            />
          </div>

          <div className="field" style={{ maxWidth: 300 }}>
            <label htmlFor="sound-vol">Feedback volume: {Math.round(prefs.soundVolume * 100)}%</label>
            <input
              id="sound-vol"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={prefs.soundVolume}
              onChange={e => setPrefs({ soundVolume: parseFloat(e.target.value) })}
            />
          </div>

          <div className="field">
            <label>Test Sound Effects</label>
            <div className="row-center" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => playAudio('tick')}>
                Tick (Button click)
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => playAudio('tack')}>
                Tack (Select / Tab)
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => playAudio('beep')}>
                Beep (Timer / Prompt)
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => playAudio('boop')}>
                Boop (Modal / Tray)
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => playAudio('complete')}>
                Complete (Chime)
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => playAudio('alert')}>
                Alert (Attention)
              </button>
            </div>
          </div>
        </SettingCard>

        {/* Card 2: Schedule & Boundaries */}
        <SettingCard
          id="schedule"
          title="Schedule & Boundaries"
          icon="calendar"
          summary={scheduleSummary}
          open={!!openCards.schedule}
          onToggle={() => toggleCard('schedule')}
        >
          <div className="field" style={{ maxWidth: 240 }}>
            <label htmlFor="pref-buffer">Default transition buffer (minutes)</label>
            <input
              id="pref-buffer"
              type="number"
              min={0}
              max={60}
              step={5}
              value={prefs.bufferMinutes}
              onChange={e => setPrefs({ bufferMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
            <span className="hint">Time added between meetings and scheduled tasks.</span>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--s3)' }}>
            <div className="field">
              <label htmlFor="pref-quiet-start">Quiet hours start</label>
              <input
                id="pref-quiet-start"
                type="time"
                value={prefs.quietStart}
                onChange={e => setPrefs({ quietStart: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="pref-quiet-end">Quiet hours end</label>
              <input
                id="pref-quiet-end"
                type="time"
                value={prefs.quietEnd}
                onChange={e => setPrefs({ quietEnd: e.target.value })}
              />
            </div>
          </div>
          <span className="hint">No reminders or high-urgency notifications are scheduled during quiet hours.</span>
        </SettingCard>

        {/* Card 3: Privacy & Data Ownership */}
        <SettingCard
          id="privacy"
          title="Privacy & Data Ownership"
          icon="lock"
          summary="Local & Private"
          open={!!openCards.privacy}
          onToggle={() => toggleCard('privacy')}
        >
          <p className="small muted">
            Your notes, task titles, and Working Guide drafts are held privately in your browser storage.
            You can export your complete data anytime or reset your local store.
          </p>

          <div className="row-center" style={{ gap: 'var(--s3)', flexWrap: 'wrap', marginTop: 'var(--s2)' }}>
            <button type="button" className="btn btn-quiet" onClick={exportData}>
              <Icon name="copy" size={18} />
              Export my data (JSON)
            </button>
            <button type="button" className="btn btn-quiet" style={{ color: 'var(--danger, #d9534f)' }} onClick={handleReset}>
              <Icon name="trash" size={18} />
              Reset all local data
            </button>
          </div>
        </SettingCard>
      </div>
    </div>
  )
}
