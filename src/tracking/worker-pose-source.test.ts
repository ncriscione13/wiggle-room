import { describe, expect, it, vi } from 'vitest';
import type { ClipPose } from './clip-format';
import type { PoseFrame } from './pose-source';
import {
  createPoseWorker,
  WorkerPoseSource,
  type Transport,
  type WorkerLike,
} from './worker-pose-source';

// M0.9: the main-thread side of worker tracking, driven through a fake
// worker. Transports (track transfer / bitmap shipping) are browser glue and
// are covered by e2e; here we pin the handshake and the result plumbing.

class FakeWorker implements WorkerLike {
  sent: { msg: unknown; transfer?: Transferable[] }[] = [];
  terminated = false;
  private readonly listeners = new Set<(e: { data: unknown }) => void>();

  postMessage(msg: unknown, transfer?: Transferable[]): void {
    this.sent.push({ msg, transfer });
  }
  addEventListener(_type: 'message', fn: (e: { data: unknown }) => void): void {
    this.listeners.add(fn);
  }
  removeEventListener(_type: 'message', fn: (e: { data: unknown }) => void): void {
    this.listeners.delete(fn);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    for (const fn of [...this.listeners]) fn({ data });
  }
}

const pose = (): ClipPose => Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);

describe('createPoseWorker (M0.9)', () => {
  it('sends init with the local asset config and resolves on ready', async () => {
    const worker = new FakeWorker();
    const promise = createPoseWorker(() => worker);
    const init = worker.sent[0]?.msg as {
      type: string;
      wasmRoot: string;
      modelUrl: string;
      numPoses: number;
      delegateOrder: string[];
    };
    expect(init.type).toBe('init');
    expect(init.wasmRoot).toContain('mediapipe');
    expect(init.modelUrl).toContain('pose_landmarker_lite.task');
    expect(init.numPoses).toBe(2);
    // CPU-first in the worker is a measured design decision (GPU-in-worker
    // fights rendering for the one GPU: 24 fps vs 60 on the same machine).
    expect(init.delegateOrder).toEqual(['CPU', 'GPU']);

    worker.emit({ type: 'ready', delegate: 'GPU', hasMSTP: true });
    const handle = await promise;
    expect(handle.delegate).toBe('GPU');
    expect(handle.hasMSTP).toBe(true);
    handle.close();
    expect(worker.terminated).toBe(true);
  });

  it('rejects (and terminates) on init-error', async () => {
    const worker = new FakeWorker();
    const promise = createPoseWorker(() => worker);
    worker.emit({ type: 'init-error', message: 'no wasm' });
    await expect(promise).rejects.toThrow(/no wasm/);
    expect(worker.terminated).toBe(true);
  });
});

describe('WorkerPoseSource (M0.9)', () => {
  function setup(): {
    worker: FakeWorker;
    source: WorkerPoseSource;
    startFn: ReturnType<typeof vi.fn>;
    stopFn: ReturnType<typeof vi.fn>;
  } {
    const worker = new FakeWorker();
    const startFn = vi.fn();
    const stopFn = vi.fn();
    const transport: Transport = {
      start: () => {
        startFn();
      },
      stop: () => {
        stopFn();
      },
    };
    const source = new WorkerPoseSource({
      handle: {
        worker,
        delegate: 'GPU',
        hasMSTP: true,
        close: () => {
          worker.terminate();
        },
      },
      transport,
    });
    return { worker, source, startFn, stopFn };
  }

  it('starts the transport and turns results into rebased PoseFrames', async () => {
    const { worker, source, startFn } = setup();
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();
    expect(startFn).toHaveBeenCalledTimes(1);

    worker.emit({ type: 'result', tMs: 5000, inferenceMs: 30, poses: [pose(), null] });
    worker.emit({ type: 'result', tMs: 5033.4, inferenceMs: 28, poses: [pose(), null] });

    expect(frames).toHaveLength(2);
    expect(frames[0]?.tS).toBe(0);
    expect(frames[1]?.tS).toBeCloseTo(0.0334, 6);
    expect(frames[1]?.frameIntervalS).toBeCloseTo(0.0334, 6);
    expect(frames[0]?.inferenceS).toBeCloseTo(0.03, 9);
    expect(frames[0]?.poses[0]).toHaveLength(33);
    expect(frames[0]?.poses[1]).toBeNull();
    expect(source.frames()).toBe(2);
    expect(source.latest()?.tS).toBeCloseTo(0.0334, 6);
  });

  it('stop() detaches, stops the transport, and ignores stale results', async () => {
    const { worker, source, stopFn } = setup();
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();
    worker.emit({ type: 'result', tMs: 100, inferenceMs: 10, poses: [null, null] });
    source.stop();
    expect(stopFn).toHaveBeenCalledTimes(1);
    expect(worker.sent.some((s) => (s.msg as { type?: string }).type === 'detach')).toBe(true);
    worker.emit({ type: 'result', tMs: 200, inferenceMs: 10, poses: [null, null] });
    expect(frames).toHaveLength(1);
  });

  it('routes worker errors to onError and stops', async () => {
    const { worker, source, stopFn } = setup();
    const errors: unknown[] = [];
    source.onError((e) => errors.push(e));
    await source.start();
    worker.emit({ type: 'error', message: 'detect blew up' });
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('detect blew up');
    expect(stopFn).toHaveBeenCalled();
  });

  it('restart rebases time cleanly', async () => {
    const { worker, source } = setup();
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();
    worker.emit({ type: 'result', tMs: 1000, inferenceMs: 5, poses: [null, null] });
    source.stop();
    await source.start();
    worker.emit({ type: 'result', tMs: 9000, inferenceMs: 5, poses: [null, null] });
    expect(frames[1]?.tS).toBe(0); // fresh base after restart
    expect(frames[1]?.frameIntervalS).toBe(0);
    expect(source.frames()).toBe(2); // cumulative
  });
});
