import { useMemo } from 'react';
import { Card, ErrorText, Field, KeyValue, ToolHeader } from '../components/ui';
import { useQueryState } from '../hooks';
import { parseAnyAddress, representations } from '../lib/convert';
import { classify } from '../lib/info';

export default function Convert() {
  const [input, setInput] = useQueryState('q', '192.168.1.10');

  const r = useMemo(() => {
    try {
      const ip = parseAnyAddress(input);
      return { ip, reps: representations(ip), type: classify(ip) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [input]);

  return (
    <>
      <ToolHeader title="IP format converter">
        Enter an address in any notation: dotted (<code>192.168.1.10</code>), integer (<code>3232235786</code>), hex (<code>0xC0A8010A</code>), binary, or
        IPv6.
      </ToolHeader>
      <Card>
        <Field label="Address" value={input} onChange={setInput} autoFocus />
        {'error' in r && <ErrorText>{r.error}</ErrorText>}
      </Card>
      {'reps' in r && r.reps && (
        <Card title={`IPv${r.ip!.version} representations`}>
          <KeyValue rows={[...r.reps.map((x): [string, string] => [x.label, x.value]), ['Address type', r.type!, '']]} />
        </Card>
      )}
    </>
  );
}
