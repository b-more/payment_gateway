'use client';

import type { ReactNode } from 'react';
import { PageHead } from '@/components/shell';

export function ModuleStub({
  title,
  subtitle,
  planned,
}: {
  title: string;
  subtitle: string;
  planned: string[];
}): ReactNode {
  return (
    <>
      <PageHead title={title} subtitle={subtitle} />
      <div className="card card-pad">
        <div className="eyebrow" style={{ marginBottom: 12 }}>Planned for this module</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', lineHeight: 1.9 }}>
          {planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          The data model, money engine and APIs backing this view are already in place; the screen is
          the next build slice.
        </p>
      </div>
    </>
  );
}
