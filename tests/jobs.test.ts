import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  getJob: vi.fn(),
  add: vi.fn(),
  retry: vi.fn(),
  getState: vi.fn(),
}));
vi.mock('../apps/api/src/infra.js', () => ({
  db: {
    job: {
      findMany: mocks.findMany,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      updateMany: mocks.updateMany,
    },
  },
  imports: { getJob: mocks.getJob, add: mocks.add },
  builds: { getJob: mocks.getJob, add: mocks.add },
}));
import { reconcileJobs, retryJob } from '../apps/api/src/services/jobs.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([{ id: 'pack', kind: 'prepare', status: 'processing' }]);
  mocks.findUniqueOrThrow.mockResolvedValue({ id: 'pack', kind: 'prepare', status: 'failed' });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.getJob.mockResolvedValue({
    failedReason: 'job stalled more than allowable limit',
    getState: mocks.getState,
    retry: mocks.retry,
  });
});
describe('interrupted imports', () => {
  it('reconciles a failed BullMQ entry with the persisted job', async () => {
    mocks.getState.mockResolvedValue('failed');
    await reconcileJobs();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it('leaves active imports untouched', async () => {
    mocks.getState.mockResolvedValue('active');
    await reconcileJobs();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it('recreates only missing queue entries', async () => {
    mocks.getJob.mockResolvedValue(null);
    await reconcileJobs();
    expect(mocks.add).toHaveBeenCalledWith(
      'prepare',
      { id: 'pack' },
      expect.objectContaining({ jobId: 'pack' }),
    );
  });
  it('retries a failed import while retaining its result checkpoint', async () => {
    mocks.getState.mockResolvedValue('failed');
    await retryJob('pack');
    expect(mocks.retry).toHaveBeenCalledWith('failed');
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty('result');
  });
  it('rejects retry when the queue entry is active', async () => {
    mocks.getState.mockResolvedValue('active');
    await expect(retryJob('pack')).rejects.toThrow();
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it('does not retry twice after a concurrent retry', async () => {
    mocks.getState.mockResolvedValue('failed');
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(retryJob('pack')).rejects.toThrow();
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it('restores failed state if Redis retry fails', async () => {
    mocks.getState.mockResolvedValue('failed');
    mocks.retry.mockRejectedValue(new Error('redis unavailable'));
    await expect(retryJob('pack')).rejects.toThrow('redis unavailable');
    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});
