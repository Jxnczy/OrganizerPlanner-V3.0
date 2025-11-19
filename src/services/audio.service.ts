import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private audioCtx: AudioContext | null = null;

  private initAudio(): void {
    if (this.audioCtx || typeof window === 'undefined') return;

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      this.audioCtx = new AudioContext();
    }
  }

  playSuccessSound(): void {
    this.initAudio();
    if (!this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const t = this.audioCtx.currentTime;
    const gainNode = this.audioCtx.createGain();
    gainNode.connect(this.audioCtx.destination);

    // Softer, quicker envelope
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.1, t + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

    const playNote = (freq: number, startTime: number) => {
      const osc = this.audioCtx!.createOscillator();
      osc.type = 'triangle'; // Softer, more pleasing tone
      osc.frequency.setValueAtTime(freq, startTime);
      osc.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.15);
    };
    
    // A quick, pleasant C-Major arpeggio
    playNote(523.25, t); // C5
    playNote(659.25, t + 0.07); // E5
    playNote(783.99, t + 0.14); // G5
  }
}