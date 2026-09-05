export type SoundKind = 'gather' | 'build' | 'arrival'

export class SoundEffects {
  enabled = false
  private context: AudioContext | null = null

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.context) this.context = new AudioContext()
      await this.context.resume()
    }
    this.enabled = enabled
  }

  play(kind: SoundKind): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return
    const notes = kind === 'gather' ? [440, 660] : kind === 'build' ? [262, 330, 392] : [392, 494, 587, 784]
    const context = this.context
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.07
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.035, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.3)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
      }
    })
  }
}
