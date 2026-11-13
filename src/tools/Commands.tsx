import { useMemo } from 'react';
import { OsToggle, PlaceholderFields, TaskCommands, useTroubleshootingInputs } from '../components/commands';
import { Card, Field, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { TOPICS, type Task } from '../data/troubleshooting';

function taskMatches(task: Task, topicTitle: string, q: string): boolean {
  if (!q) return true;
  const haystack = [topicTitle, task.title, ...[...task.windows, ...task.debian].flatMap((c) => [c.cmd, c.note ?? '', c.pkg ?? ''])]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export default function Commands() {
  const { os, setOs, values, setters } = useTroubleshootingInputs();
  const [query, setQuery] = useQueryState('q', '');

  const topics = useMemo(
    () => TOPICS.map((t) => ({ ...t, tasks: t.tasks.filter((task) => taskMatches(task, t.title, query.trim())) })).filter((t) => t.tasks.length),
    [query],
  );

  const jump = (id: string) => document.getElementById(`topic-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <ToolHeader title="Troubleshooting commands">
        Everyday network troubleshooting commands for Windows and Debian, side by side. Fill in your host, port and interface names below and every
        command updates, ready to copy.
      </ToolHeader>

      <Card>
        <div className="row">
          <OsToggle os={os} onChange={setOs} />
          <Field label="Search" value={query} onChange={setQuery} placeholder="dns, port, arp, mtu…" mono={false} />
        </div>
        <PlaceholderFields os={os} values={values} setters={setters} />
        {!query && (
          <div className="topic-chips">
            {TOPICS.map((t) => (
              <button key={t.id} type="button" className="chip" onClick={() => jump(t.id)}>
                {t.title}
              </button>
            ))}
          </div>
        )}
      </Card>

      {topics.length === 0 && <p className="muted">No commands match “{query}”.</p>}

      {topics.map((t) => (
        <section key={t.id} id={`topic-${t.id}`} className="card topic">
          <div className="card-head">
            <h2>{t.title}</h2>
          </div>
          {t.tasks.map((task) => (
            <TaskCommands key={task.id} task={task} os={os} values={values} />
          ))}
        </section>
      ))}
    </>
  );
}
