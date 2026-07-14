import { useStore } from '../../store'
import { PropertyList } from '../../components/PropertyList'

/** Trial-only view: record when each protocol application actually happened at this site (measurement
 *  dates timed "N days after" derive from these) and the conditions it was made under. */
export function ApplicationsView(): JSX.Element {
  const { snapshot, setSnapshot, run } = useStore()
  const applications = snapshot!.applications

  const actualDate = (code: string): string =>
    snapshot!.applicationActuals.find((a) => a.timingCode === code)?.actualDate ?? ''
  const setActualDate = (code: string, date: string): void => {
    const others = snapshot!.applicationActuals.filter((a) => a.timingCode !== code)
    run('Recording application date', async () =>
      setSnapshot(
        await window.art.trial.saveApplicationActuals([
          ...others.map((a) => ({ timingCode: a.timingCode, actualDate: a.actualDate })),
          { timingCode: code, actualDate: date }
        ])
      )
    )
  }

  return (
    <div className="card">
      <h2>Applications</h2>
      {applications.length === 0 ? (
        <p className="muted">
          This protocol defines no applications, so there is nothing to record here. Applications are
          set by the protocol author.
        </p>
      ) : (
        <>
          <p className="muted">
            When each protocol application actually happened at this site (measurement dates timed
            &quot;N days after&quot; derive from these), and the conditions it was made under.
          </p>
          {applications.map((a) => (
            <div key={a.id ?? a.timingCode} className="appl-record">
              <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
                <div style={{ width: 130 }}>
                  <label>
                    Application {a.timingCode}
                    {a.targetGrowthStage ? ` · ${a.targetGrowthStage}` : ''}
                  </label>
                  <input
                    type="date"
                    value={actualDate(a.timingCode)}
                    onChange={(e) => setActualDate(a.timingCode, e.target.value)}
                  />
                </div>
                {a.description && <span className="muted">{a.description}</span>}
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                  Conditions
                </div>
                <PropertyList scope="application" scopeRef={a.timingCode} addLabel="+ Add condition" />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
