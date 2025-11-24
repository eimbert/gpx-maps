// src/app/recording/recorder.service.ts
import { Injectable } from '@angular/core';

export interface RecorderOptions {
  includeAudio?: boolean;       // si la pestaña/ventana compartida aporta audio
  frameRate?: number;           // 30-60 típico
  videoBitsPerSecond?: number;  // calidad/bitrate
  mimeType?: string;            // 'video/webm;codecs=vp9' | 'video/webm;codecs=vp8'
  width?: number;
  height?: number;
}

@Injectable({ providedIn: 'root' })
export class RecorderService {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private downloadingUrl?: string;

  get isRecording(): boolean { return !!this.recorder && this.recorder.state === 'recording'; }

  async startCapture(options: RecorderOptions = {}): Promise<void> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Este navegador no soporta getDisplayMedia.');
    }
    const {
      includeAudio = true,
      frameRate = 60,
      videoBitsPerSecond = 6_000_000,
      mimeType = 'video/webm;codecs=vp9',
      width,
      height
    } = options;

    // Pide capturar PANTALLA/VENTANA/PESTAÑA (recomendado: elige la PESTAÑA y marca “compartir audio”).
    const videoConstraints: MediaTrackConstraints = { frameRate };
    if (width) videoConstraints.width = width;
    if (height) videoConstraints.height = height;

    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: includeAudio
    } as MediaStreamConstraints);

    this.chunks = [];
    let chosenMime = mimeType;
    if (!MediaRecorder.isTypeSupported(chosenMime)) {
      chosenMime = 'video/webm;codecs=vp8';
    }
    this.recorder = new MediaRecorder(this.stream, { mimeType: chosenMime, videoBitsPerSecond });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data); // e.data es Blob
    };
    this.recorder.onstop = () => {
      // Para evitar que la pantalla quede “compartida”
      this.stream?.getTracks().forEach(t => t.stop());
    };
    this.recorder.start(); // empieza a grabar
  }

  async stopAndGetBlob(): Promise<Blob> {
    if (!this.recorder) throw new Error('No hay grabación en curso.');

    if (this.recorder.state !== 'inactive') {
      await new Promise<void>(resolve => {
        const r = this.recorder!;
        r.addEventListener('stop', () => {
          this.stream?.getTracks().forEach(t => t.stop());
          resolve();
        }, { once: true });
        r.stop();
      });
    }

    // Usa el mime negociado por el MediaRecorder o el del primer chunk
    const mime = this.recorder?.mimeType || this.chunks[0]?.type || 'video/webm';
    const blob = new Blob(this.chunks, { type: mime });

    // limpiar
    this.recorder = undefined;
    this.stream = undefined;
    this.chunks = [];

    return blob;
  }


  downloadBlob(blob: Blob, baseName = 'recording'): void {
    if (this.downloadingUrl) URL.revokeObjectURL(this.downloadingUrl);
    this.downloadingUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    a.href = this.downloadingUrl;
    a.download = `${baseName}-${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // puedes llamar a URL.revokeObjectURL(this.downloadingUrl) más tarde si quieres
  }
}
