/**
 * "Live values -> initial values" (RoboPLC Suite 1.16.0): while logged in, the globals whose live
 * value differs from the project's initial value, one row each; the retained ones ticked, the
 * others not. Apply writes the ticked live values into the project's initial values (the PLC and
 * its retained values are not touched); a save keeps them, and a clean upload or a new machine
 * from this project then starts with them.
 */
import { useEffect, useMemo, useState } from 'react'

import { useDebugger } from '../../../../middleware/shared/providers'
import { type LiveRow, readLiveInitials } from '../../../services/live-initial-values'
import type { LiveSkip } from '../../../utils/live-initial-values'

type Props = {
  onApply: (values: Map<string, string>) => void
  onClose: () => void
}

const LiveInitialDialog = ({ onApply, onClose }: Props) => {
  const port = useDebugger()
  const [rows, setRows] = useState<LiveRow[] | null>(null)
  const [skipped, setSkipped] = useState<LiveSkip[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    let live = true
    readLiveInitials(port)
      .then(({ rows: r, skipped: s }) => {
        if (!live) return
        const changed = r.filter((x) => x.changed)
        setRows(changed)
        setSkipped(s)
        setTicked(new Set(changed.filter((x) => x.retain).map((x) => x.name)))
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [port])

  const unreadable = useMemo(() => (rows ?? []).filter((r) => r.live === null), [rows])
  const groups = useMemo(() => {
    const ok = (rows ?? []).filter((r) => r.live !== null)
    return [
      { title: 'Retained', rows: ok.filter((r) => r.retain) },
      { title: 'Other global variables', rows: ok.filter((r) => !r.retain) },
    ]
  }, [rows])

  const toggle = (name: string) =>
    setTicked((t) => {
      const n = new Set(t)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })

  const apply = () => {
    const values = new Map<string, string>()
    for (const r of rows ?? []) if (ticked.has(r.name) && r.live !== null) values.set(r.name, r.live)
    onApply(values)
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40' onClick={onClose}>
      <div
        role='dialog'
        aria-label='Live values to initial values'
        className='flex max-h-[80vh] w-[860px] flex-col gap-3 rounded-lg bg-white p-4 text-xs shadow-xl dark:bg-neutral-900 dark:text-neutral-200'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='text-sm font-semibold'>Live values → initial values</div>
        <div className='text-neutral-500'>
          The ticked live values become the project's initial values, in every global variable list. The PLC and
          its retained values are not changed. Save the project to keep them; a clean upload or a new machine from
          this project then starts with them.
        </div>

        {error && <div className='text-red-500'>Could not read the PLC: {error}</div>}
        {!error && rows === null && <div>Reading the live values…</div>}
        {rows !== null && rows.length === 0 && <div>Every live value is already the initial value.</div>}

        {rows !== null && rows.length > 0 && (
          <div className='overflow-auto rounded border border-neutral-300 dark:border-neutral-700'>
            <table className='w-full border-collapse'>
              <thead className='sticky top-0 bg-neutral-100 dark:bg-neutral-800'>
                <tr className='text-left'>
                  <th className='w-8 p-1' />
                  <th className='p-1'>Variable</th>
                  <th className='p-1'>Initial value now</th>
                  <th className='p-1'>Live value (becomes the initial value)</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) =>
                  g.rows.length === 0
                    ? null
                    : [
                        <tr key={`h:${g.title}`}>
                          <td colSpan={4} className='bg-neutral-50 p-1 font-semibold dark:bg-neutral-800/60'>
                            {g.title} ({g.rows.length})
                          </td>
                        </tr>,
                        ...g.rows.map((r) => (
                          <tr key={r.name} className='border-t border-neutral-200 dark:border-neutral-800'>
                            <td className='p-1 text-center'>
                              <input
                                type='checkbox'
                                aria-label={`Take ${r.name}`}
                                checked={ticked.has(r.name)}
                                onChange={() => toggle(r.name)}
                              />
                            </td>
                            <td className='p-1 font-mono'>{r.name}</td>
                            <td className='max-w-[260px] truncate p-1 font-mono text-neutral-500' title={r.current}>
                              {r.current || '(none)'}
                            </td>
                            <td className='max-w-[300px] truncate p-1 font-mono' title={r.live ?? ''}>
                              {r.live}
                            </td>
                          </tr>
                        )),
                      ],
                )}
              </tbody>
            </table>
          </div>
        )}

        {(unreadable.length > 0 || skipped.length > 0) && (
          <details className='text-neutral-500'>
            <summary>Not taken: {unreadable.length + skipped.length}</summary>
            <ul className='ml-4 list-disc'>
              {unreadable.map((r) => (
                <li key={r.name}>{r.name}: its value cannot be stored exactly (a long string or not a number)</li>
              ))}
              {skipped.map((s) => (
                <li key={s.name}>
                  {s.name}: {s.why}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className='flex justify-end gap-2'>
          <button
            type='button'
            className='rounded-md border border-neutral-400 px-3 py-1 hover:border-brand'
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type='button'
            className='rounded-md bg-brand px-3 py-1 text-white hover:opacity-90 disabled:opacity-40'
            disabled={ticked.size === 0}
            onClick={apply}
          >
            Apply {ticked.size} {ticked.size === 1 ? 'value' : 'values'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { LiveInitialDialog }
