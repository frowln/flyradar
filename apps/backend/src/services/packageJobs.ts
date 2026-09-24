import { randomUUID } from 'node:crypto';
import type { OfflinePackage } from '@skyatlas/shared';

/**
 * Package builds that outlive the request asking for them.
 *
 * A cold build paces its Wikipedia calls and takes 45 seconds or more — longer
 * than nginx, the app's own 12-second timeout, or a flaky airport connection
 * will hold a request open. So the build runs here, the POST answers at once
 * with a job id, and the app polls for the result.
 *
 * In memory and per process on purpose: there is one backend process, a lost
 * job costs one retry, and finished packages also land in Redis, so a restart
 * loses nothing that took long to make.
 */

export type JobView =
  | { status: 'pending' }
  | { status: 'done'; package: OfflinePackage }
  | { status: 'error'; reason: 'not_found' | 'failed' | 'timeout'; error: string };

type Builder = (flightNumber: string, date: string, locale: string) => Promise<OfflinePackage | null>;

interface Job {
  id: string;
  key: string;
  view: JobView;
  createdAt: number;
  settledAt?: number;
}

export interface PackageJobsOptions {
  /** How long a finished job can still be collected. */
  resultTtlMs?: number;
  /** A build still pending after this long is reported failed. */
  deadlineMs?: number;
  /** Refuse new work beyond this many jobs held at once. */
  maxJobs?: number;
  now?: () => number;
  onDone?: () => void;
  onError?: (err: unknown) => void;
}

const MESSAGES = {
  not_found: 'Cannot build package for this flight',
  failed: 'Package build failed',
  timeout: 'Package build timed out'
} as const;

export function createPackageJobs(build: Builder, options: PackageJobsOptions = {}) {
  const resultTtlMs = options.resultTtlMs ?? 10 * 60_000;
  const deadlineMs = options.deadlineMs ?? 5 * 60_000;
  const maxJobs = options.maxJobs ?? 200;
  const now = options.now ?? Date.now;

  const jobs = new Map<string, Job>();
  /** The pending job per flight/date/locale — a whole cabin asks at boarding. */
  const pendingByKey = new Map<string, string>();

  function settle(job: Job, view: JobView): void {
    if (job.view.status !== 'pending') return;
    job.view = view;
    job.settledAt = now();
    if (pendingByKey.get(job.key) === job.id) pendingByKey.delete(job.key);
  }

  function fail(job: Job, reason: 'not_found' | 'failed' | 'timeout'): void {
    settle(job, { status: 'error', reason, error: MESSAGES[reason] });
  }

  function sweep(): void {
    const t = now();
    for (const job of jobs.values()) {
      if (job.view.status === 'pending' && t - job.createdAt > deadlineMs) fail(job, 'timeout');
      if (job.settledAt !== undefined && t - job.settledAt > resultTtlMs) jobs.delete(job.id);
    }
  }

  return {
    /** Starts a build, or joins the one already running. Null when at capacity. */
    start(flightNumber: string, date: string, locale: string): { jobId: string } | null {
      sweep();
      const key = `${flightNumber}:${date}:${locale}`;
      const running = pendingByKey.get(key);
      if (running) return { jobId: running };
      if (jobs.size >= maxJobs) return null;

      const job: Job = { id: randomUUID(), key, view: { status: 'pending' }, createdAt: now() };
      jobs.set(job.id, job);
      pendingByKey.set(key, job.id);

      // Deferred so a builder that throws synchronously still settles the job.
      Promise.resolve().then(() => build(flightNumber, date, locale)).then(
        (pkg) => {
          if (!pkg) return fail(job, 'not_found');
          settle(job, { status: 'done', package: pkg });
          options.onDone?.();
        },
        (err) => {
          fail(job, 'failed');
          options.onError?.(err);
        }
      );
      return { jobId: job.id };
    },

    get(jobId: string): JobView | null {
      sweep();
      return jobs.get(jobId)?.view ?? null;
    },

    size(): number {
      return jobs.size;
    }
  };
}

export type PackageJobs = ReturnType<typeof createPackageJobs>;
