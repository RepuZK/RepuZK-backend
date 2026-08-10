import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('returns status ok with a current ISO timestamp', () => {
    const before = Date.now();
    const result = controller.check();
    const after = Date.now();

    expect(result.status).toBe('ok');

    const timestampMs = new Date(result.timestamp).getTime();
    expect(timestampMs).toBeGreaterThanOrEqual(before);
    expect(timestampMs).toBeLessThanOrEqual(after);
  });
});
