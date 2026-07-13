import { useMemo, useState } from 'react'
import { useStore } from '../../store'
import { PlotGrid, type ColourBy } from './PlotGrid'
import { timingLabel, assessmentDate } from '@shared/timing'
import type { AssessmentHeader, Property } from '@shared/types'

type DocKind = 'fieldmap' | 'summary'

const DOCS: { id: DocKind; label: string; title: string }[] = [
  { id: 'fieldmap', label: 'Field Map', title: 'Field Map' },
  { id: 'summary', label: 'Trial Summary', title: 'Trial Summary' }
]

export function DocumentsView(): JSX.Element {
  const { snapshot, run } = useStore()
  const [doc, setDoc] = useState<DocKind>('fieldmap')
  const [colourBy, setColourBy] = useState<ColourBy>('treatment')

  const protocol = snapshot!.protocol
  const trial = snapshot!.trial
  const isAlpha = protocol.design === 'ALPHA'
  const active = DOCS.find((d) => d.id === doc)!

  const exportPdf = (): void => {
    run('Exporting PDF', async () => {
      await window.art.report.exportPdf({ title: `${protocol.title || 'Trial'} — ${active.title}` })
    })
  }

  if (!trial) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Documents</h2>
        <p className="muted">Create a trial to generate printable field documents.</p>
      </div>
    )
  }

  return (
    <>
      <div className="card no-print">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0 }}>Documents</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Field-ready printouts. Choose a document, then print or export it as PDF.
            </p>
          </div>
          <div className="row">
            <button className="primary" onClick={exportPdf}>
              Export PDF
            </button>
            <button onClick={() => window.print()}>Print</button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 16, alignItems: 'center' }}>
          <div className="segmented">
            {DOCS.map((d) => (
              <button
                key={d.id}
                className={doc === d.id ? 'active' : ''}
                onClick={() => setDoc(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          {doc === 'fieldmap' && (
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <label style={{ margin: 0 }}>Colour by</label>
              <select value={colourBy} onChange={(e) => setColourBy(e.target.value as ColourBy)}>
                <option value="none">None</option>
                <option value="treatment">Treatment</option>
                <option value="rep">Rep</option>
                {isAlpha && <option value="block">Block</option>}
              </select>
            </div>
          )}
        </div>
      </div>

      {doc === 'fieldmap' ? (
        <FieldMapDoc colourBy={colourBy} />
      ) : (
        <SummaryDoc />
      )}
    </>
  )
}

/** Common title block atop each printed document. */
function DocHeader({ subtitle }: { subtitle: string }): JSX.Element {
  const { snapshot } = useStore()
  const protocol = snapshot!.protocol
  const trial = snapshot!.trial!
  const site = [trial.siteName, trial.location, trial.city, trial.state, trial.country]
    .filter(Boolean)
    .join(', ')
  return (
    <div className="doc-title">
      <h1>{protocol.title || 'Untitled trial'}</h1>
      <p className="report-subtitle">
        {subtitle}
        {site ? ` · ${site}` : ''}
      </p>
    </div>
  )
}

/** B1 — the physical plot layout, printed large for use in the field. */
function FieldMapDoc({ colourBy }: { colourBy: ColourBy }): JSX.Element {
  const { snapshot } = useStore()
  const protocol = snapshot!.protocol
  return (
    <div className="doc-page">
      <DocHeader
        subtitle={`Field map — ${protocol.design}, ${protocol.replicates} reps, ${snapshot!.plots.length} plots`}
      />
      <PlotGrid snapshot={snapshot!} colourBy={colourBy} cell={56} />
      <p className="muted doc-foot">
        Rows are numbered from the bottom-left corner. Each cell shows the plot number, treatment
        (T#), and rep (R#){protocol.design === 'ALPHA' ? ' and block (B#)' : ''}.
      </p>
    </div>
  )
}

/** B4 — one-page overview: metadata, site details, treatments, schedule, assessments, field map. */
function SummaryDoc(): JSX.Element {
  const { snapshot } = useStore()
  const protocol = snapshot!.protocol
  const trial = snapshot!.trial!
  const actuals = snapshot!.applicationActuals

  const siteProps = snapshot!.properties.filter((p) => p.scope === 'trial')
  const condsByCode = useMemo(() => {
    const m = new Map<string, Property[]>()
    for (const p of snapshot!.properties.filter((x) => x.scope === 'application')) {
      const list = m.get(p.scopeRef) ?? []
      list.push(p)
      m.set(p.scopeRef, list)
    }
    return m
  }, [snapshot])

  const applications = [...snapshot!.applications].sort((a, b) => a.ordinal - b.ordinal)
  const actualDate = (code: string): string =>
    actuals.find((x) => x.timingCode === code)?.actualDate || ''

  const headerTitle = (h: AssessmentHeader): string =>
    h.description || h.ratingType || `Assessment ${h.ordinal + 1}`
  const headers = [...snapshot!.assessmentHeaders].sort((a, b) => a.ordinal - b.ordinal)

  return (
    <div className="doc-page">
      <DocHeader subtitle="Trial summary" />

      {/* Metadata + site details */}
      <table className="report-meta" style={{ maxWidth: 720 }}>
        <tbody>
          <tr>
            <th>Crop</th>
            <td>{protocol.crop || '—'}</td>
            <th>Season</th>
            <td>{protocol.season || '—'}</td>
          </tr>
          <tr>
            <th>Target</th>
            <td>{protocol.targetPest || '—'}</td>
            <th>Design</th>
            <td>
              {protocol.design}, {protocol.replicates} reps, {snapshot!.plots.length} plots
            </td>
          </tr>
          <tr>
            <th>Investigator</th>
            <td>{protocol.investigator || '—'}</td>
            <th>Operator</th>
            <td>{trial.operator || '—'}</td>
          </tr>
          <tr>
            <th>Planting date</th>
            <td>{trial.plantingDate || '—'}</td>
            <th>Protocol</th>
            <td>
              <code>{protocol.protocolUid.slice(0, 8) || '—'}</code> v{protocol.protocolVersion}
            </td>
          </tr>
          {siteProps.map((p) => (
            <tr key={p.id}>
              <th>{p.key}</th>
              <td colSpan={3}>{p.value || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Treatments */}
      <h2>Treatments</h2>
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Name</th>
            <th style={{ width: 70 }}>Timing</th>
            <th>Product</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {snapshot!.treatments.map((t) =>
            t.applications.length === 0 ? (
              <tr key={t.number}>
                <td className="num">{t.number}</td>
                <td>{t.name || `Treatment ${t.number}`}</td>
                <td>—</td>
                <td className="muted">untreated</td>
                <td>—</td>
              </tr>
            ) : (
              t.applications.map((l, li) => (
                <tr key={`${t.number}-${li}`}>
                  {li === 0 ? (
                    <>
                      <td className="num" rowSpan={t.applications.length}>
                        {t.number}
                      </td>
                      <td rowSpan={t.applications.length}>{t.name || `Treatment ${t.number}`}</td>
                    </>
                  ) : null}
                  <td>{l.applicationRef || '—'}</td>
                  <td>{l.product || '—'}</td>
                  <td>{[l.rate, l.rateUnit].filter(Boolean).join(' ') || '—'}</td>
                </tr>
              ))
            )
          )}
        </tbody>
      </table>

      {/* Application schedule */}
      {applications.length > 0 && (
        <>
          <h2>Application schedule</h2>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Timing</th>
                <th>Target growth stage</th>
                <th style={{ width: 110 }}>Actual date</th>
                <th>Conditions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const conds = condsByCode.get(a.timingCode) ?? []
                return (
                  <tr key={a.timingCode}>
                    <td>{a.timingCode || '—'}</td>
                    <td>{a.targetGrowthStage || a.description || '—'}</td>
                    <td>{actualDate(a.timingCode) || '—'}</td>
                    <td>
                      {conds.length
                        ? conds.map((c) => `${c.key}: ${c.value}`).join(' · ')
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Assessment plan */}
      {headers.length > 0 && (
        <>
          <h2>Assessment plan</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Assessment</th>
                <th style={{ width: 80 }}>Timing</th>
                <th style={{ width: 110 }}>Est. date</th>
                <th style={{ width: 120 }}>Growth stage</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => (
                <tr key={h.id}>
                  <td>{headerTitle(h)}</td>
                  <td>{timingLabel(h) || '—'}</td>
                  <td>{assessmentDate(h, actuals) || '—'}</td>
                  <td>{h.growthStage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Embedded field map */}
      <h2 className="doc-break">Field map</h2>
      <PlotGrid snapshot={snapshot!} colourBy="treatment" cell={44} />
    </div>
  )
}
