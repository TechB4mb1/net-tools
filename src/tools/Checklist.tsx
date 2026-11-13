import { useState } from 'react';
import { OsToggle, PlaceholderFields, TaskCommands, useTroubleshootingInputs } from '../components/commands';
import { Card, ToolHeader } from '../components/ui';
import { CHECKLIST, getTask } from '../data/troubleshooting';

export default function Checklist() {
  const { os, setOs, values, setters } = useTroubleshootingInputs();
  // Which steps are ticked off. Kept in memory only: a checklist run is per incident.
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

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
            <button type="button" className="link" onClick={() => setDone(new Set())}>
              Reset
            </button>
          )}
        </div>
      </Card>

      <ol className="steps">
        {CHECKLIST.map((step, i) => (
          <li key={i} className={`card step ${done.has(i) ? 'step-done' : ''}`}>
            <div className="step-head">
              <span className="step-num" aria-hidden>
                {i + 1}
              </span>
              <h2>{step.title}</h2>
              <label className="checkbox step-check">
                <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} />
                <span>OK</span>
              </label>
            </div>
            <p className="step-why">{step.why}</p>
            <h3>What to look for</h3>
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
          </li>
        ))}
      </ol>
    </>
  );
}
