// Lee los feeds GTFS-Realtime públicos de Renfe y los resume en un objeto pequeño
// para la web. Nunca lanza error: si un feed no responde, lo anota en "sources".

export const FEEDS = {
  vehicles: "https://gtfsrt.renfe.com/vehicle_positions.json",
  trips: "https://gtfsrt.renfe.com/trip_updates.json",
  alerts: "https://gtfsrt.renfe.com/alerts.json",
  tripsLD: "https://gtfsrt.renfe.com/trip_updates_LD.json",
};

// Los feeds pueden venir en camelCase o snake_case según el conversor de Renfe.
export const pick = (o, ...keys) => {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
const entities = (feed) => pick(feed, "entity", "entities") || [];

function text(t) {
  const tr = pick(t, "translation") || [];
  const es = tr.find((x) => (x.language || "").toLowerCase().startsWith("es"));
  return ((es || tr[0] || {}).text || "").trim();
}

export function parseVehicles(feed) {
  return entities(feed)
    .map((e) => {
      const v = pick(e, "vehicle");
      if (!v) return null;
      const pos = pick(v, "position") || {};
      const trip = pick(v, "trip") || {};
      const veh = pick(v, "vehicle") || {};
      const lat = num(pick(pos, "latitude", "lat"));
      const lon = num(pick(pos, "longitude", "lon"));
      if (lat === null || lon === null) return null;
      return {
        id: String(pick(veh, "id") ?? e.id),
        label: pick(veh, "label") || "",
        tripId: pick(trip, "tripId", "trip_id") || null,
        routeId: pick(trip, "routeId", "route_id") || null,
        lat: +lat.toFixed(5),
        lon: +lon.toFixed(5),
        status: pick(v, "currentStatus", "current_status") ?? null,
        stopId: pick(v, "stopId", "stop_id") || null,
        ts: num(pick(v, "timestamp")),
      };
    })
    .filter(Boolean);
}

// Retraso en segundos: el del viaje, o el primero que aparezca en sus paradas.
export function parseTrips(feed) {
  const out = {};
  for (const e of entities(feed)) {
    const tu = pick(e, "tripUpdate", "trip_update");
    if (!tu) continue;
    const trip = pick(tu, "trip") || {};
    const id = pick(trip, "tripId", "trip_id");
    if (!id) continue;
    let delay = num(pick(tu, "delay"));
    if (delay === null) {
      for (const s of pick(tu, "stopTimeUpdate", "stop_time_update") || []) {
        const d = num(pick(pick(s, "arrival") || {}, "delay")) ?? num(pick(pick(s, "departure") || {}, "delay"));
        if (d !== null) { delay = d; break; }
      }
    }
    const rel = pick(trip, "scheduleRelationship", "schedule_relationship");
    out[id] = { delay, cancelled: rel === "CANCELED" || rel === "CANCELLED" || rel === 3 };
  }
  return out;
}

export function parseAlerts(feed) {
  return entities(feed)
    .map((e) => {
      const a = pick(e, "alert");
      if (!a) return null;
      const header = text(pick(a, "headerText", "header_text"));
      const desc = text(pick(a, "descriptionText", "description_text"));
      if (!header && !desc) return null;
      const routes = [...new Set((pick(a, "informedEntity", "informed_entity") || [])
        .map((ie) => pick(ie, "routeId", "route_id")).filter(Boolean))];
      const period = (pick(a, "activePeriod", "active_period") || [])[0] || {};
      return {
        id: String(e.id),
        header, desc, routes,
        start: num(pick(period, "start")),
        end: num(pick(period, "end")),
        effect: pick(a, "effect") ?? null,
      };
    })
    .filter(Boolean);
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "atlas-ferroviario (datos abiertos)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function buildLive() {
  const sources = {};
  const raw = {};
  await Promise.all(Object.entries(FEEDS).map(async ([k, url]) => {
    try {
      raw[k] = await getJSON(url);
      const ts = num(pick(pick(raw[k], "header") || {}, "timestamp"));
      sources[k] = { ok: true, feedTimestamp: ts, entities: entities(raw[k]).length };
    } catch (err) {
      sources[k] = { ok: false, error: String(err.message || err) };
    }
  }));

  const delays = raw.trips ? parseTrips(raw.trips) : {};
  const trains = raw.vehicles ? parseVehicles(raw.vehicles).map((t) => {
    const d = t.tripId ? delays[t.tripId] : undefined;
    return { ...t, delayMin: d && d.delay !== null ? Math.round(d.delay / 60) : null };
  }) : [];
  const ld = raw.tripsLD ? Object.entries(parseTrips(raw.tripsLD)).map(([tripId, d]) => ({
    tripId, delayMin: d.delay !== null ? Math.round(d.delay / 60) : null, cancelled: d.cancelled,
  })) : [];

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    sources,
    cercanias: { trains, alerts: raw.alerts ? parseAlerts(raw.alerts) : [] },
    largaDistancia: { trips: ld },
  };
}
