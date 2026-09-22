import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureAudio, playAudio } from './audio'

describe('audio feedback engine', () => {
  let createdOscillators: Array<{
    type: string
    frequency: { setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }>
  let createdGains: Array<{
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>
      linearRampToValueAtTime: ReturnType<typeof vi.fn>
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
    }
    connect: ReturnType<typeof vi.fn>
  }>
  let currentMockContext: {
    currentTime: number
    state: string
    destination: Record<string, unknown>
    resume: ReturnType<typeof vi.fn>
    createOscillator: ReturnType<typeof vi.fn>
    createGain: ReturnType<typeof vi.fn>
  } | null = null

  beforeEach(() => {
    createdOscillators = []
    createdGains = []

    class MockAudioContext {
      currentTime = 10
      state = 'suspended'
      destination = {}
      resume = vi.fn().mockResolvedValue(undefined)
      createOscillator = vi.fn(() => {
        const osc = {
          type: 'sine',
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }
        createdOscillators.push(osc)
        return osc
      })
      createGain = vi.fn(() => {
        const gain = {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }
        createdGains.push(gain)
        return gain
      })

      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        currentMockContext = this
      }
    }

    // Assign mock AudioContext to global window
    ;(globalThis as unknown as { window: { AudioContext: unknown } }).window = {
      AudioContext: MockAudioContext,
    }

    // Default configuration
    configureAudio({ enabled: true, volume: 0.7 })
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
    currentMockContext = null
  })

  it('resumes audio context if suspended', () => {
    playAudio('tick')
    expect(currentMockContext?.resume).toHaveBeenCalled()
  })

  it('plays "tick" feedback with triangle wave micro-tap', () => {
    playAudio('tick')
    expect(createdOscillators.length).toBe(1)
    expect(createdOscillators[0].type).toBe('triangle')
    expect(createdOscillators[0].start).toHaveBeenCalledWith(10)
    expect(createdOscillators[0].stop).toHaveBeenCalledWith(10.025)
    expect(createdGains[0].connect).toHaveBeenCalledTimes(1)
  })

  it('plays "tack" feedback for tactile selections', () => {
    playAudio('tack')
    expect(createdOscillators.length).toBe(1)
    expect(createdOscillators[0].type).toBe('sine')
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(540, 10)
    expect(createdOscillators[0].stop).toHaveBeenCalledWith(10.05)
  })

  it('plays "beep" chime blip', () => {
    playAudio('beep')
    expect(createdOscillators.length).toBe(1)
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 10)
    expect(createdGains[0].gain.linearRampToValueAtTime).toHaveBeenCalled()
  })

  it('plays "boop" downward pop for modals and cancel actions', () => {
    playAudio('boop')
    expect(createdOscillators.length).toBe(1)
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(360, 10)
    expect(createdOscillators[0].stop).toHaveBeenCalledWith(10.085)
  })

  it('plays "complete" two-note harmonic sequence', () => {
    playAudio('complete')
    expect(createdOscillators.length).toBe(2)
    // First note C5 (523.25 Hz)
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 10)
    // Second note G5 (783.99 Hz) starting slightly later
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(783.99, 10.05)
    expect(createdOscillators[0].start).toHaveBeenCalledWith(10)
    expect(createdOscillators[1].start).toHaveBeenCalledWith(10.05)
  })

  it('plays "alert" feedback', () => {
    playAudio('alert')
    expect(createdOscillators.length).toBe(1)
    expect(createdOscillators[0].type).toBe('triangle')
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(700, 10)
  })

  it('does not play sound when disabled via configureAudio', () => {
    configureAudio({ enabled: false })
    playAudio('tick')
    expect(createdOscillators.length).toBe(0)
  })

  it('does not play sound when volume is set to 0', () => {
    configureAudio({ volume: 0 })
    playAudio('beep')
    expect(createdOscillators.length).toBe(0)
  })

  it('clamps volume within [0, 1] range', () => {
    configureAudio({ volume: 2.5 })
    playAudio('tick')
    // At max volume 1.0, tick vol is 0.16 * 1.0 = 0.16
    expect(createdGains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.16, 10)
  })

  it('gracefully handles missing window/AudioContext', () => {
    delete (globalThis as Record<string, unknown>).window
    expect(() => playAudio('tick')).not.toThrow()
  })
})
