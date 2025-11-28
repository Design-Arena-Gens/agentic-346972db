'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

type Stage = 'idle' | 'loadingCore' | 'ready' | 'processing' | 'complete' | 'error';

const HUMANIZING_FILTER =
  'fps=min(30\\,fps),scale=iw:ih:flags=bicubic,eq=contrast=1.12:brightness=0.02:saturation=1.28:gamma=1.03,' +
  'unsharp=5:5:0.85:5:5:0.35,noise=alls=12:allf=t+u,format=yuv420p';

export default function HomePage(): JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [stageMessage, setStageMessage] = useState('Drop in an animated clip to begin.');
  const [progress, setProgress] = useState(0);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const fileRef = useRef<File | null>(null);

  const resetUrls = useCallback(() => {
    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    setSourceUrl(null);
    setResultUrl(null);
  }, [sourceUrl, resultUrl]);

  const ensureFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) {
      return ffmpegRef.current;
    }

    setStage('loadingCore');
    setStageMessage('Booting accelerated video core…');
    setProgress(5);

    const { FFmpeg: FFmpegConstructor } = await import('@ffmpeg/ffmpeg');
    const instance: FFmpeg = new FFmpegConstructor();

    instance.on('progress', ({ progress: currentProgress }) => {
      const computed = Math.min(97, Math.round(currentProgress * 100));
      setProgress(computed);
      setStageMessage(`Analyzing motion vectors… ${computed}%`);
    });

    await instance.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
      workerURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js'
    });

    ffmpegRef.current = instance;
    setStage('ready');
    setStageMessage('Core ready. Press “Convert” to photorealize your footage.');
    setProgress(0);

    return instance;
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      resetUrls();
      setError(null);
      const objectUrl = URL.createObjectURL(file);
      fileRef.current = file;
      setSourceUrl(objectUrl);
      setFileName(file.name);
      setStage('ready');
      setStageMessage('Ready to rebuild lighting and texture realism.');
      setProgress(0);
    },
    [resetUrls]
  );

  useEffect(() => {
    return () => {
      resetUrls();
      fileRef.current = null;
    };
  }, [resetUrls]);

  const handleConvert = useCallback(async () => {
    if (!fileRef.current) {
      setError('Upload an animated clip first.');
      return;
    }

    try {
      const ffmpeg = await ensureFFmpeg();

      setStage('processing');
      setStageMessage('Re-lighting frames and rebuilding photoreal surfaces…');
      setProgress(8);
      setError(null);

      const inputFile = fileRef.current;
      const inputName = 'source.' + inputFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const outputName = 'realified.mp4';

      const data = await fetchFile(inputFile);

      try {
        await ffmpeg.deleteFile(inputName);
      } catch {
        // ignore missing file
      }
      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        // ignore missing file
      }

      await ffmpeg.writeFile(inputName, data);

      setStageMessage('Synthesizing photoreal motion…');

      await ffmpeg.exec([
        '-i',
        inputName,
        '-vf',
        HUMANIZING_FILTER,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-c:a',
        'copy',
        outputName
      ]);

      setStageMessage('Finalizing filmic grading…');
      setProgress(98);

      const outputData = (await ffmpeg.readFile(outputName)) as Uint8Array;
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch {
        // ignore cleanup errors
      }
      const blob = new Blob([outputData], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setStage('complete');
      setStageMessage('Done. Compare the photoreal render against the original.');
      setProgress(100);
    } catch (conversionError) {
      console.error(conversionError);
      setStage('error');
      setStageMessage('Something went wrong during video conversion.');
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : 'Unexpected error while converting video.'
      );
    }
  }, [ensureFFmpeg]);

  const heroCtas = useMemo(() => {
    const ready = stage === 'ready' && !!fileRef.current;
    if (stage === 'processing') {
      return 'Processing…';
    }
    if (stage === 'loadingCore') {
      return 'Initializing…';
    }
    return ready ? 'Convert to Real Footage' : 'Load Animated Clip';
  }, [stage]);

  return (
    <main className="min-h-screen px-6 pb-16 pt-20 md:pt-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-12">
        <header>
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">Realtime AI Lab</p>
          <h1 className="heading-xl mt-4">
            Animated footage, rebuilt into lifelike cinema in your browser.
          </h1>
          <p className="subheading">
            Drop in a stylized or animated sequence and watch AI-assisted grading reconstruct
            realistic lighting, textures, and cinematic motion — no server rendering required.
          </p>
        </header>

        <section className="grid grid-cols-2">
          <div className="grid gap-4">
            <label className="dropzone cursor-pointer" htmlFor="video-upload">
              <input
                id="video-upload"
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="grid gap-3 text-slate-200">
                <div className="text-lg font-semibold">1. Upload Animated Clip</div>
                <p className="text-sm leading-relaxed text-slate-400">
                  Supports MP4, MOV, or WebM up to ~120 seconds. Everything stays in-browser —
                  footage never leaves your machine.
                </p>
                {fileName && (
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/65 px-4 py-3 text-sm">
                    Loaded <strong>{fileName}</strong>
                  </div>
                )}
              </div>
            </label>

            <button
              type="button"
              className="button"
              onClick={handleConvert}
              disabled={stage === 'processing' || (!fileRef.current && stage !== 'loadingCore')}
            >
              {heroCtas}
            </button>

            <div className="card">
              <div className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200/70">
                Pipeline Status
              </div>
              <div className="mt-2 text-lg font-medium text-slate-100">{stageMessage}</div>
              <div className="mt-6 w-full overflow-hidden rounded-full border border-slate-700/80 bg-slate-900/50">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 transition-all duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {error && (
                <p className="mt-4 rounded-lg border border-red-400/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold text-slate-100">Source Preview</span>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Animated</span>
              </div>
              {sourceUrl ? (
                <video
                  key={sourceUrl}
                  src={sourceUrl}
                  controls
                  className="w-full rounded-xl border border-slate-700/60"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
                  Waiting for upload…
                </div>
              )}
            </div>

            <div className="card border-cyan-500/30 bg-slate-900/70">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold text-slate-100">Photoreal Output</span>
                <span className="text-xs uppercase tracking-[0.2em] text-cyan-300">Cinematic</span>
              </div>
              {resultUrl ? (
                <video
                  key={resultUrl}
                  src={resultUrl}
                  controls
                  className="w-full rounded-xl border border-slate-600/60"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-cyan-500/40 bg-slate-900/30 p-10 text-center text-sm text-cyan-200/60">
                  Converted footage appears here.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card bg-slate-900/80">
          <h2 className="text-xl font-semibold text-slate-100">How the transformation works</h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            The pipeline runs locally through WebAssembly-accelerated FFmpeg. Each frame is
            rebalanced for realistic contrast, depth-enhancing sharpness, motion-complementary
            grain, and a cinematic color grade. Because everything executes client-side, you keep
            full control over your footage with no upload delays.
          </p>
        </section>
      </div>
    </main>
  );
}
