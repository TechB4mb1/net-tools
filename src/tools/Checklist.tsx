import { useState } from 'react';
import { OsToggle, PlaceholderFields, TaskCommands, useTroubleshootingInputs } from '../components/commands';
import { Card, ToolHeader } from '../components/ui';
import { CHECKLIST, getTask } from '../data/troubleshooting';

export default function Checklist() {
  const { os, setOs, values, setters } = useTroubleshootingInputs();
  // Which steps are ticked off. Kept in memory only: a checklist run is per incident.
  const [done, setDone] = useState<Set<number>>(new Set());
  // Checked steps collapse; these are checked steps the user has reopened.
  const [reopened, setReopened] = useState<Set<number>>(new Set());
  const flip = (set: Set<number>, i: number, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(i);
    else next.delete(i);
    return next;
  };
  const toggle = (i: number) => {
    setDone((prev) => flip(prev, i, !prev.has(i)));
    setReopened((prev) => flip(prev, i, false));
  };
  const toggleOpen = (i: number) => setReopened((prev) => flip(prev, i, !prev.has(i)));
  const reset = () => {
    setDone(new Set());
    setReopened(new Set());
  };

  return (
    <>
      <ToolHeader title="Connectivity checklist">
        Work from the bottom up: link, IP address, gateway, internet, DNS, service, MTU. The first step that fails is usually where the problem is.
      </ToolHeader>

      <Card>
        <OsToggle os={os} onChange={setOs} />
        <PlaceholderFields os={os} values={values} setters={setters} />
        <div className="actions">
          <span className="muted">
            {done.size} of {CHECKLIST.length} steps checked
          </span>
          {done.size > 0 && (
            <button type="button" className="link" onClick={reset}>
              Reset
            </button>
          )}
        </div>
      </Card>

      <ol className="steps">
        {CHECKLIST.map((step, i) => {
          const isDone = done.has(i);
          const open = !isDone || reopened.has(i);
          return (
            <li key={i} className={`card step${isDone ? ' step-done' : ''}${open ? '' : ' step-collapsed'}`}>
              <div className="step-head">
                <span className="step-num" aria-hidden>
                  {isDone ? '✓' : i + 1}
                </span>
                <h2>
                  {isDone ? (
                    <button type="button" className="step-toggle" onClick={() => toggleOpen(i)} aria-expanded={open} aria-controls={`step-body-${i}`}>
                      {step.title}
                      <span className="step-chevron" aria-hidden>
                        {open ? '▾' : '▸'}
                      </span>
                    </button>
                  ) : (
                    step.title
                  )}
                </h2>
                <label className="checkbox step-check">
                  <input type="checkbox" checked={isDone} onChange={() => toggle(i)} />
                  <span>OK</span>
                </label>
              </div>
              {open && (
                <div id={`step-body-${i}`}>
                  <p className="step-why">{step.why}</p>
                  <h3 className="step-label">What to look for</h3>
                  <ul className="look-for">
                    {step.lookFor.map((l, j) => (
                      <li key={j}>{l}</li>
                    ))}
                  </ul>
                  {step.tasks.map((id) => {
                    const task = getTask(id);
                    return task ? <TaskCommands key={id} task={task} os={os} values={values} /> : null;
                  })}
                  {step.link && (
                    <p className="step-link">
                      <a href={step.link.href}>{step.link.label} →</a>
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
