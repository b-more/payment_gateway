'use client';

import { useRef, useState, type ReactNode } from 'react';

/**
 * Tabbed API example. The only dark block on the page.
 *
 * Amounts follow the real convention: an integer number of ngwee, sent as a
 * string. "5000" is K50.00. Getting this wrong in docs is how integrators end
 * up charging a hundred times too much, so the comment says it out loud.
 */
type TabKey = 'Request' | 'Response' | 'Webhook';
const TABS: TabKey[] = ['Request', 'Response', 'Webhook'];

const C = ({ children }: { children: ReactNode }): ReactNode => <span className="cmt">{children}</span>;
const K = ({ children }: { children: ReactNode }): ReactNode => <span className="key">{children}</span>;
const S = ({ children }: { children: ReactNode }): ReactNode => <span className="str">{children}</span>;
const V = ({ children }: { children: ReactNode }): ReactNode => <span className="verb">{children}</span>;

function Request(): ReactNode {
  return (
    <pre>
      <C># Collect K50.00 from a mobile money wallet.{'\n'}# amount is an integer number of ngwee, as a string.</C>
      {'\n'}
      <V>POST</V> https://api.instacompayzm.com/v1/collections{'\n'}
      <K>X-Api-Key</K>: ic_live_a41f...{'\n'}
      <K>X-Api-Secret</K>: ...{'\n'}
      <K>Idempotency-Key</K>: 0f1c9d2e-7b44{'\n'}
      <K>Content-Type</K>: application/json{'\n\n'}
      {'{\n'}
      {'  '}<K>&quot;processor&quot;</K>: <S>&quot;MTN&quot;</S>,{'\n'}
      {'  '}<K>&quot;amount&quot;</K>: <S>&quot;5000&quot;</S>,{'          '}<C>// K50.00</C>{'\n'}
      {'  '}<K>&quot;msisdn&quot;</K>: <S>&quot;260970000000&quot;</S>,{'\n'}
      {'  '}<K>&quot;reference&quot;</K>: <S>&quot;INV-20481&quot;</S>{'\n'}
      {'}'}
    </pre>
  );
}

function Response(): ReactNode {
  return (
    <pre>
      <C># 201 Created. The customer now approves it on their handset.</C>
      {'\n\n'}
      {'{\n'}
      {'  '}<K>&quot;id&quot;</K>: <S>&quot;txn_01HQ8M4K2P&quot;</S>,{'\n'}
      {'  '}<K>&quot;status&quot;</K>: <S>&quot;PROCESSING&quot;</S>,{'\n'}
      {'  '}<K>&quot;processor&quot;</K>: <S>&quot;MTN&quot;</S>,{'\n'}
      {'  '}<K>&quot;amount&quot;</K>: <S>&quot;5000&quot;</S>,{'\n'}
      {'  '}<K>&quot;currency&quot;</K>: <S>&quot;ZMW&quot;</S>,{'\n'}
      {'  '}<K>&quot;reference&quot;</K>: <S>&quot;INV-20481&quot;</S>,{'\n'}
      {'  '}<K>&quot;created_at&quot;</K>: <S>&quot;2026-07-19T09:14:22Z&quot;</S>{'\n'}
      {'}'}
    </pre>
  );
}

function Webhook(): ReactNode {
  return (
    <pre>
      <C># We POST this to your endpoint once the customer approves.{'\n'}# Verify the signature before you trust it.</C>
      {'\n'}
      <K>X-Instacompay-Signature</K>: t=1768900462,v1=9f2b...{'\n\n'}
      {'{\n'}
      {'  '}<K>&quot;event&quot;</K>: <S>&quot;collection.succeeded&quot;</S>,{'\n'}
      {'  '}<K>&quot;data&quot;</K>: {'{\n'}
      {'    '}<K>&quot;id&quot;</K>: <S>&quot;txn_01HQ8M4K2P&quot;</S>,{'\n'}
      {'    '}<K>&quot;status&quot;</K>: <S>&quot;SUCCESS&quot;</S>,{'\n'}
      {'    '}<K>&quot;amount&quot;</K>: <S>&quot;5000&quot;</S>,{'\n'}
      {'    '}<K>&quot;fee&quot;</K>: <S>&quot;75&quot;</S>,{'             '}<C>// K0.75</C>{'\n'}
      {'    '}<K>&quot;net&quot;</K>: <S>&quot;4925&quot;</S>,{'           '}<C>// K49.25</C>{'\n'}
      {'    '}<K>&quot;reference&quot;</K>: <S>&quot;INV-20481&quot;</S>{'\n'}
      {'  }\n'}
      {'}'}
    </pre>
  );
}

const PANELS: Record<TabKey, () => ReactNode> = { Request, Response, Webhook };

export function CodePanel(): ReactNode {
  const [tab, setTab] = useState<TabKey>('Request');
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  // Arrow keys move between tabs, which is what a tablist is expected to do.
  function onKeyDown(e: React.KeyboardEvent): void {
    const i = TABS.indexOf(tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    const key = TABS[next];
    if (key) {
      setTab(key);
      refs.current[next]?.focus();
    }
  }

  const Body = PANELS[tab];

  return (
    <div className="codepanel">
      <div className="tabs" role="tablist" aria-label="API example" onKeyDown={onKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            className="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        <Body />
      </div>
    </div>
  );
}
