import { describe, expect, it } from 'vitest';
import { CHECKLIST, fillCommand, getTask, PLACEHOLDERS, TOPICS } from './troubleshooting';

const allTasks = TOPICS.flatMap((t) => t.tasks);
const allCmds = allTasks.flatMap((t) => [...t.windows.map((c) => ({ c, os: 'windows' })), ...t.debian.map((c) => ({ c, os: 'debian' }))]);

describe('troubleshooting data', () => {
  it('has unique task ids', () => {
    const ids = allTasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every task commands for both platforms', () => {
    for (const t of allTasks) {
      expect(t.windows.length, t.id).toBeGreaterThan(0);
      expect(t.debian.length, t.id).toBeGreaterThan(0);
    }
  });

  it('only uses known placeholders', () => {
    for (const { c } of allCmds) {
      for (const [, name] of `${c.cmd} ${c.note ?? ''}`.matchAll(/\{(\w+)\}/g)) {
        expect(PLACEHOLDERS as readonly string[], c.cmd).toContain(name);
      }
    }
  });

  it('keeps platform-specific fields on the right platform', () => {
    for (const { c, os } of allCmds) {
      if (os === 'windows') expect(c.pkg, c.cmd).toBeUndefined();
      if (os === 'debian') {
        expect(c.ps, c.cmd).toBeUndefined();
        expect(c.admin, c.cmd).toBeUndefined();
      }
    }
  });

  it('references existing tasks from the checklist', () => {
    for (const step of CHECKLIST) for (const id of step.tasks) expect(getTask(id), id).toBeDefined();
  });
});

describe('fillCommand', () => {
  it('substitutes values and falls back to defaults', () => {
    expect(fillCommand('nc -zv {host} {port}', { host: 'srv1', port: '22' })).toBe('nc -zv srv1 22');
    expect(fillCommand('ping -c 4 {gateway}', { gateway: '  ' })).toBe('ping -c 4 192.168.1.1');
    expect(fillCommand('Restart-NetAdapter -Name "{adapter}"', { adapter: 'Wi-Fi' })).toBe('Restart-NetAdapter -Name "Wi-Fi"');
  });
});
