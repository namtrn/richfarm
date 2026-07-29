import { describe, expect, it } from 'vitest';
import { serializePlantCommand } from './plantCommandSerialization';

describe('serializePlantCommand', () => {
  it('runs commands for one scoped plant in order', async () => {
    const events: string[] = [];
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const first = serializePlantCommand('scope-a', 'plant-a', async () => {
      events.push('first:start');
      started();
      await blocked;
      events.push('first:end');
    });
    const second = serializePlantCommand('scope-a', 'plant-a', async () => { events.push('second'); });
    await didStart;
    expect(events).toEqual(['first:start']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('allows different plants to proceed independently', async () => {
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const first = serializePlantCommand('scope-a', 'plant-a', async () => {
      started();
      await blocked;
    });
    await didStart;
    let otherCompleted = false;
    await serializePlantCommand('scope-a', 'plant-b', async () => { otherCompleted = true; });
    expect(otherCompleted).toBe(true);
    release();
    await first;
  });

  it('continues the lane after a failed command', async () => {
    await expect(serializePlantCommand('scope-a', 'plant-a', async () => {
      throw new Error('write failed');
    })).rejects.toThrow('write failed');
    await expect(serializePlantCommand('scope-a', 'plant-a', async () => 42)).resolves.toBe(42);
  });
});
