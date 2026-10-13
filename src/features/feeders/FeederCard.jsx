import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { X, Plugs, MagnifyingGlass, ArrowLeft, MapPin, ClockCounterClockwise } from "@phosphor-icons/react";
import { Section, Skeleton, Problem, Sparkline, HowItWorks } from "@/features/explore/cardParts";
import { formatWat } from "./useFeederLive";
import { STATUS_COLOR } from "./useFeederBrowser";

// Every metered DisCo feeder: search and filter the list, pick one to see
// its stats and fly to it (in 3D). What's measured, what's accumulated and
// what's approximate (the position) are each labelled as such.

const STATUS_LABEL = { on: "On", shedding: "Shedding", off: "Off" };
const PAGE = 150;
const fmtMw = (v) => (v == null ? "—" : v.toFixed(v < 10 ? 2 : 1));
const POSITION_TEXT = {
  network: "At its station, matched to Onction's substation data.",
  "google:site": "At its station, as found on Google Maps.",
  "google:area": "Approximate: Google Maps found the area the station is named after, not the station itself.",
};

function Dot({ status }) {
  return <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />;
}

function Stat({ label, value, unit, note, testid }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-2" data-testid={testid}>
      <p className="font-mono text-base font-bold leading-none text-foreground">{value}{unit && <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{unit}</span>}</p>
      <p className="mt-1 text-[9.5px] text-muted-foreground">{label}</p>
      {note && <p className="text-[9px] text-muted-foreground/80">{note}</p>}
    </div>
  );
}

function Detail({ f, detail, data, onBack }) {
  const d = detail.status === "ready" ? detail.data : null;
  const since = formatWat(f.recordingSince);
  return (
    <div data-testid="feeder-detail">
      <div className="px-4 pb-3">
        <button type="button" onClick={onBack} className="mb-2 flex items-center gap-1 text-[10.5px] text-primary hover:underline"><ArrowLeft className="h-3 w-3" /> All feeders</button>
        <p className="text-sm font-semibold leading-snug text-foreground" data-testid="feeder-name">{f.name}</p>
        <p className="text-[10.5px] text-muted-foreground">{f.station} · {f.state} · {f.disco} · {f.kv} kV · {f.category || "Uncategorised"}</p>
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold" data-testid="feeder-status">
          <Dot status={f.status} /> {STATUS_LABEL[f.status]}
          {f.status === "shedding" && <span className="font-normal text-muted-foreground">· voltage present, feeder switched off</span>}
        </span>
      </div>
      <Section icon={Plugs} title="Today" badge={{ label: data.stale ? "Delayed" : "Live", cls: data.stale ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500", tip: `Metered readings from the feeder-compliance API, polled every minute. Last poll ${formatWat(data.capturedAt)}.` }}
               how={{
                 what: "How this feeder is doing now and today.",
                 source: "The feeder-compliance API (live load, on/off, hours on today), polled every minute by Onction's poller, which also keeps the history.",
                 how: `Availability = hours on ÷ hours into the feed's day (${data.hoursElapsed} h; the feed's day began ${formatWat(data.dayStartedAt)}, not at midnight). Online in recorded hours = share of minute-polls the feeder was on. Peak recorded = the highest clean reading the poller has stored for it.`,
                 limits: `The feed has no rated capacity, so peak recorded load isn't capacity, and it only covers what's been recorded since ${since}. Readings with quality problems (e.g. a reversed CT) are left out of load figures.`,
               }}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Live load" value={f.flagged && f.status === "on" ? "—" : fmtMw(f.liveMw)} unit="MW" note={f.flagged ? "Reading flagged, not used" : null} testid="feeder-live" />
          <Stat label="Hours on, feed's day" value={f.uptimeH.toFixed(1)} unit="h" note={`day began ${formatWat(data.dayStartedAt)}`} testid="feeder-uptime" />
          <Stat label="Availability" value={f.availabilityTodayPct} unit="%" note={`of ${data.hoursElapsed} h so far`} testid="feeder-availability" />
          <Stat label="Peak recorded load" value={fmtMw(f.peakMw)} unit="MW" note={`since ${since} · not rated capacity`} testid="feeder-peak" />
        </div>
        {f.onlinePct24h != null && (
          <p className="mt-2 text-[10.5px] text-muted-foreground">On for <span className="font-mono text-foreground">{f.onlinePct24h}%</span> of polls over the last {f.recordedHours24h} recorded hour{f.recordedHours24h === 1 ? "" : "s"}.</p>
        )}
        {d?.hourly?.length >= 2 && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Sparkline points={d.hourly} tone={STATUS_COLOR.on} /> on, hour by hour (last {d.hourly.length} h)
          </div>
        )}
      </Section>
      <Section icon={MapPin} title="Position" source={f.position ? (f.position.precision === "area" ? "estimate" : "onction") : null} delay={0.03}>
        {f.position ? (
          <p className="text-[11px] text-muted-foreground" data-testid="feeder-position">
            {POSITION_TEXT[f.position.method === "network" ? "network" : `google:${f.position.precision}`]}
            {f.position.matchedName && <> Matched to <span className="text-foreground">{f.position.matchedName}</span>.</>}
            {" "}Feeders of the same station are spread in a small circle so each can be picked. The column's height is the live load.
          </p>
        ) : (
          <Problem>{f.positionPending ? "Still looking up this feeder's station — it will appear on the map within a few minutes." : `Not on the map: “${f.station}” couldn't be found in ${f.state}.`}</Problem>
        )}
      </Section>
      {d?.events?.length > 0 && (
        <Section icon={ClockCounterClockwise} title="Recent changes" delay={0.06}>
          <ul className="space-y-0.5 text-[10.5px]">
            {d.events.slice(0, 8).map(e => (
              <li key={e.at} className="flex items-center gap-1.5"><Dot status={e.status} /><span className="text-foreground">{STATUS_LABEL[e.status]}</span><span className="ml-auto font-mono text-muted-foreground">{formatWat(e.at)}</span></li>
            ))}
          </ul>
        </Section>
      )}
      {detail.status === "error" && <div className="px-4 py-2"><Problem>History couldn't be loaded: {detail.message}</Problem></div>}
    </div>
  );
}

// For someone new: three linked dropdowns — DisCo, then station, then
// feeder. Each narrows the next; choosing a feeder shows it on the map.
function Picker({ data, disco, setDisco, station, setStation, selectedId, onPick }) {
  const inDisco = disco ? data.feeders.filter(f => f.disco === disco) : data.feeders;
  const stations = useMemo(() => {
    const m = new Map();
    for (const f of inDisco) { const k = `${f.station}|${f.state}`; m.set(k, { key: k, station: f.station, state: f.state, n: (m.get(k)?.n || 0) + 1 }); }
    return [...m.values()].sort((a, b) => a.station.localeCompare(b.station));
  }, [inDisco]);
  const feeders = (station ? inDisco.filter(f => `${f.station}|${f.state}` === station) : inDisco).slice().sort((a, b) => a.name.localeCompare(b.name));
  // Group the feeder options so a long list stays readable.
  const groupBy = station ? null : disco ? (f) => `${f.station} · ${f.state}` : (f) => f.disco;
  const groups = groupBy ? [...feeders.reduce((m, f) => m.set(groupBy(f), [...(m.get(groupBy(f)) || []), f]), new Map())].sort(([a], [b]) => a.localeCompare(b)) : [[null, feeders]];
  const discos = [...new Set(data.feeders.map(f => f.disco))].sort();
  const cls = "h-8 w-full min-w-0 rounded-md border border-border bg-background/60 px-2 text-[12px] text-foreground outline-none focus:border-primary/70";
  const opt = (f) => <option key={f.id} value={f.id}>{f.name} — {STATUS_LABEL[f.status]}{f.position ? "" : " (not on map)"}</option>;
  return (
    <div className="space-y-1.5 border-b border-border px-4 pb-3" data-testid="feeder-picker">
      <p className="text-[10.5px] text-muted-foreground">Choose a DisCo, then a station, then a feeder:</p>
      <select value={disco} onChange={(e) => { setDisco(e.target.value); setStation(""); }} aria-label="1. DisCo" className={cls}>
        <option value="">1. All DisCos ({data.feeders.length} feeders)</option>
        {discos.map(d => <option key={d} value={d}>{d} ({data.feeders.filter(f => f.disco === d).length} feeders)</option>)}
      </select>
      <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="2. Station" className={cls}>
        <option value="">2. All stations{disco ? ` in ${disco}` : ""} ({stations.length})</option>
        {stations.map(st => <option key={st.key} value={st.key}>{st.station} · {st.state} ({st.n})</option>)}
      </select>
      <select value={feeders.some(f => f.id === selectedId) ? selectedId : ""} onChange={(e) => e.target.value && onPick(Number(e.target.value))} aria-label="3. Feeder" className={cls}>
        <option value="">3. Choose a feeder ({feeders.length})</option>
        {groups.map(([label, list]) => label
          ? <optgroup key={label} label={label}>{list.map(opt)}</optgroup>
          : list.map(opt))}
      </select>
    </div>
  );
}

export default function FeederCard({ browser }) {
  const { list, selectedId, select, detail, close } = browser;
  const [q, setQ] = useState("");
  const [disco, setDisco] = useState("");
  const [station, setStation] = useState("");
  const [status, setStatus] = useState("");
  const [kv, setKv] = useState("");
  const [sort, setSort] = useState("name");
  const [shown, setShown] = useState(PAGE);
  const data = list.status === "ready" ? list.data : null;

  const filtered = useMemo(() => {
    if (!data) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = data.feeders.filter(f =>
      (!disco || f.disco === disco) && (!station || `${f.station}|${f.state}` === station) && (!status || f.status === status) && (!kv || String(f.kv) === kv)
      && words.every(w => `${f.name} ${f.station} ${f.state}`.toLowerCase().includes(w)));
    const by = { name: (a, b) => a.name.localeCompare(b.name), load: (a, b) => (b.liveMw ?? -1) - (a.liveMw ?? -1), availability: (a, b) => b.availabilityTodayPct - a.availabilityTodayPct };
    return rows.sort(by[sort]);
  }, [data, q, disco, station, status, kv, sort]);
  const selected = data?.feeders.find(f => f.id === selectedId);
  // Picking from the list or the map moves the dropdowns to that feeder.
  useEffect(() => {
    if (!selected) return;
    setDisco(selected.disco);
    setStation(`${selected.station}|${selected.state}`);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const select_ = "h-7 rounded border border-border bg-background/60 px-1.5 text-[11px] text-foreground outline-none focus:border-primary/70";

  return (
    <motion.aside
      data-testid="feeder-card"
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute left-3 right-3 bottom-3 top-auto z-[26] flex max-h-[60%] flex-col overflow-hidden rounded-xl border border-border shadow-2xl backdrop-blur-md
                 sm:right-auto sm:bottom-auto sm:top-[68px] sm:w-[360px] sm:max-h-[calc(100%-7.5rem)]"
      style={{ background: "color-mix(in srgb, hsl(var(--card)) 94%, transparent)" }}
      aria-label="DisCo feeders"
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary"><Plugs className="h-4 w-4" weight="bold" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Feeders</p>
          {data && <p className="text-[10.5px] text-muted-foreground">{data.feeders.length} metered · {data.located} on the map{data.pending ? ` · ${data.pending} being placed` : ""}</p>}
        </div>
        <button onClick={close} aria-label="Close feeders" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.status === "loading" && <div className="px-4 py-3"><Skeleton lines={4} /></div>}
        {list.status === "error" && <div className="px-4 py-3"><Problem>Feeder list unavailable: {list.message}</Problem></div>}
        {data && <Picker data={data} disco={disco} setDisco={setDisco} station={station} setStation={setStation} selectedId={selectedId} onPick={select} />}
        {data && selected && <Detail f={selected} detail={detail} data={data} onBack={() => select(null)} />}
        {data && !selected && (
          <>
            <div className="space-y-1.5 border-b border-border px-4 pb-2.5 pt-2.5">
              <p className="text-[10.5px] text-muted-foreground">Or search and filter the list:</p>
              <label className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 focus-within:border-primary/70">
                <MagnifyingGlass className="h-3.5 w-3.5 text-muted-foreground" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Feeder, station or state" aria-label="Search feeders"
                       className="h-8 min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground" />
              </label>
              <div className="flex flex-wrap gap-1">
                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={select_}>
                  <option value="">Any status</option><option value="on">On</option><option value="shedding">Shedding</option><option value="off">Off</option>
                </select>
                <select value={kv} onChange={(e) => setKv(e.target.value)} aria-label="Voltage" className={select_}>
                  <option value="">11 + 33 kV</option><option value="33">33 kV</option><option value="11">11 kV</option>
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by" className={select_}>
                  <option value="name">A–Z</option><option value="load">Live load</option><option value="availability">Availability</option>
                </select>
              </div>
              <p className="text-[10px] text-muted-foreground" data-testid="feeder-count">{filtered.length} feeder{filtered.length === 1 ? "" : "s"}</p>
            </div>
            <ul data-testid="feeder-list">
              {filtered.slice(0, shown).map(f => (
                <li key={f.id}>
                  <button type="button" onClick={() => select(f.id)} className="flex w-full items-center gap-2 border-b border-border/50 px-4 py-2 text-left hover:bg-accent">
                    <Dot status={f.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-foreground">{f.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{f.station} · {f.state} · {f.kv} kV{!f.position && !f.positionPending ? " · not on map" : ""}</span>
                    </span>
                    <span className="flex-shrink-0 text-right font-mono text-[10.5px]">
                      <span className="block text-foreground">{fmtMw(f.liveMw)} MW</span>
                      <span className="block text-muted-foreground">{f.availabilityTodayPct}% avail.</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length > shown && (
              <button type="button" onClick={() => setShown(s => s + PAGE)} className="w-full px-4 py-2 text-[11px] font-semibold text-primary hover:bg-accent">Show {Math.min(PAGE, filtered.length - shown)} more</button>
            )}
            <div className="px-4 py-2"><HowItWorks
              what="Every DisCo feeder in the feeder-compliance feed: its status now, load, and supply today."
              source={`The feeder-compliance API, polled every minute (last poll ${formatWat(data.capturedAt)}).`}
              how={`Availability = hours on ÷ hours into the feed's day, which began ${formatWat(data.dayStartedAt)} (the feed doesn't reset at midnight). Positions are each feeder's station: matched to Onction's substations, or found on Google Maps within the feeder's state.`}
              limits="The feed has no feeder coordinates or rated capacity. Map positions are the station, some only approximate (the area it's named after), and a few stations can't be found."
            /></div>
          </>
        )}
      </div>
    </motion.aside>
  );
}
