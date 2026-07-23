import { useMemo, useState } from "react";
import { validateRaw } from "./lib/validate";
import type { Finding, Verdict } from "./lib/types";
import { SCENARIOS, TOOLS } from "./data/tools";

const VERDICT_LABEL: Record<Verdict, string> = {
  valid: "VALID",
  repairable: "REPAIRABLE",
  invalid: "INVALID",
};

const TYPE_LABEL: Record<Finding["type"], string> = {
  unparseable: "unparseable output",
  unknown_tool: "hallucinated tool",
  missing_required: "missing argument",
  unexpected_arg: "unexpected argument",
  wrong_type: "wrong type",
  enum_violation: "bad enum value",
  constraint_violation: "constraint broken",
};

function pretty(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

export function App() {
  const [raw, setRaw] = useState(SCENARIOS[0].raw);
  const [activeId, setActiveId] = useState(SCENARIOS[0].id);
  const [showTools, setShowTools] = useState(false);

  const result = useMemo(() => validateRaw(TOOLS, raw), [raw]);
  const active = SCENARIOS.find((s) => s.id === activeId);

  function loadScenario(id: string) {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setActiveId(id);
    setRaw(s.raw);
  }

  const errors = result.findings.filter((f) => f.severity === "error");
  const warnings = result.findings.filter((f) => f.severity === "warning");

  return (
    <div className="app">
      <header className="head">
        <h1>
          Tool&nbsp;Caller <span className="mono">{"{ }"}</span>
        </h1>
        <p className="tagline">
          Paste the tool call a model just produced and watch it get checked against the tool's
          JSON&nbsp;Schema — hallucinated names, wrong types, bad enums, malformed JSON — then
          auto-repaired into a call that would actually run.
        </p>
        <p className="signal">
          The week GitHub trending filled up with agents that call tools — and OpenAI paused a model
          for acting outside its sandbox — the unglamorous truth is that most agent failures are just
          malformed tool calls. This validates them <b>before</b> they run. 100% in your browser, no API key.
        </p>
      </header>

      <div className="scenarios">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={s.id === activeId ? "chip on" : "chip"}
            onClick={() => loadScenario(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {active && <p className="hint">{active.hint}</p>}

      <div className="grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Model output</h2>
            <button className="link" onClick={() => setShowTools((v) => !v)}>
              {showTools ? "hide toolbox" : "show toolbox"} ({TOOLS.length})
            </button>
          </div>
          <textarea
            value={raw}
            spellCheck={false}
            onChange={(e) => {
              setRaw(e.target.value);
              setActiveId("");
            }}
          />
          {showTools && (
            <div className="tools">
              {TOOLS.map((t) => (
                <div key={t.name} className="tool">
                  <code>{t.name}</code>
                  <span>({Object.keys(t.parameters.properties ?? {}).join(", ")})</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Verdict</h2>
            <span className={`badge ${result.verdict}`}>{VERDICT_LABEL[result.verdict]}</span>
          </div>

          {result.call && (
            <p className="callname">
              tool:&nbsp;<code>{result.call.name || "(none)"}</code>
              {result.suggestion && result.suggestion !== result.call.name && (
                <span className="arrow"> → {result.suggestion}</span>
              )}
            </p>
          )}

          {result.parseNotes.length > 0 && (
            <div className="notes">
              <b>Had to clean the JSON:</b>
              <ul>
                {result.parseNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {result.findings.length === 0 ? (
            <p className="ok">No problems found — this call is ready to run.</p>
          ) : (
            <ul className="findings">
              {[...errors, ...warnings].map((f, i) => (
                <li key={i} className={`finding ${f.severity}`}>
                  <div className="ftop">
                    <span className="ftype">{TYPE_LABEL[f.type]}</span>
                    {f.path && <code className="fpath">{f.path}</code>}
                  </div>
                  <div className="fmsg">{f.message}</div>
                  {f.fix && (
                    <div className="ffix">
                      fix: <s>{pretty(f.fix.from)}</s> → <b>{pretty(f.fix.to)}</b>
                      <span className="fnote"> — {f.fix.note}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {result.repaired && (
            <div className="repaired">
              <h3>Repaired call</h3>
              <pre>{pretty(result.repaired)}</pre>
            </div>
          )}
          {result.verdict === "invalid" && (
            <p className="cantfix">
              Can't safely repair this one — a fix would have to guess the model's intent, so it's
              flagged for a human or a retry instead.
            </p>
          )}
        </section>
      </div>

      <footer className="foot">
        Built by <a href="https://www.kumarbipul.com">Kumar Bipul</a> · IT Director → AI/ML ·{" "}
        <a href="https://github.com/kbipul/kb-daily-builds">kb-daily-builds</a> Day 16
      </footer>
    </div>
  );
}
