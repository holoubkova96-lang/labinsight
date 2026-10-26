import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  /** Tabulky a sloupce pro našeptávání. */
  schema: Record<string, string[]>;
  label: string;
};

/** Barvy editoru z CSS proměnných aplikace – funguje ve světlém i tmavém režimu. */
const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', fontSize: '13px', height: '100%' },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    caretColor: 'var(--text)',
  },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  },
  '.cm-scroller': { overflow: 'auto' },
});

/** CodeMirror 6 s SQL zvýrazněním, našeptáváním a Ctrl/Cmd+Enter pro spuštění. */
export function SqlEditor({ value, onChange, onRun, schema, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langConf = useRef(new Compartment());
  const handlers = useRef({ onChange, onRun });

  useEffect(() => {
    handlers.current = { onChange, onRun };
  });

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          theme,
          langConf.current.of(sql({ dialect: PostgreSQL, upperCaseKeywords: true })),
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  handlers.current.onRun();
                  return true;
                },
              },
            ]),
          ),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ 'aria-label': label }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // editor se vytváří jen jednou; obsah a schéma se mění níže
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vnější změna textu (výběr ukázkového dotazu)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  // Schéma pro našeptávání se načte asynchronně
  useEffect(() => {
    view.current?.dispatch({
      effects: langConf.current.reconfigure(sql({ dialect: PostgreSQL, schema, upperCaseKeywords: true })),
    });
  }, [schema]);

  return <div ref={host} className="h-full overflow-hidden rounded-lg border border-line" />;
}
