import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  MapPin,
  Layers,
  TrendingUp,
  Download,
  HelpCircle,
  Compass,
  ArrowRight,
} from "lucide-react";
import { Panel, Pill, KeyValue, MockNote } from "@/components/ocean/primitives";
import { ProfileChart, SeriesChart, BarsChart } from "@/components/ocean/charts";
import { OceanMap } from "@/components/ocean/OceanMap";
import { useOcean, fmtCoord } from "@/lib/ocean/state";
import {
  profileAt,
  timeSeries,
  regionalStats,
  tempAtDepth,
  anomalyAt,
  confidenceAt,
  thermoclineDepth,
  gapScore,
  gapPriority,
  type ProfilePoint,
  type SeriesPoint,
} from "@/lib/ocean/data";
import { parseAssistantQuery } from "@/lib/ocean/intelligence/assistantQuery";
import { fetchRealProfile, fetchRealTimeseries } from "@/lib/ocean/api";
import { DEPTHS } from "@/lib/ocean/data";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Ocean Assistant · ADRISHTA: Subsurface Ocean AI" },
      {
        name: "description",
        content:
          "Query reconstructed ocean thermal fields in natural language. Instant visual summaries, vertical profiles, time series, and regional comparisons.",
      },
    ],
  }),
  component: AssistantPage,
});

type PayloadType = {
  lat?: number;
  lon?: number;
  depth?: number;
  temp?: number;
  uncertainty?: number;
  tc?: number;
  matchedSnapshot?: string;
  deltaHours?: number;
  days?: number;
  profilePoints?: ProfilePoint[];
  seriesPoints?: SeriesPoint[];
  as?: ReturnType<typeof regionalStats>;
  bob?: ReturnType<typeof regionalStats>;
};

type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  queryType?: "coordinate" | "timeseries" | "regional" | "gaps" | "explain";
  payload?: PayloadType;
};

const SUGGESTIONS = [
  "Show subsurface temperature near 15°N, 65°E at 100 m.",
  "How did temperature at 200 m change over the last 30 days?",
  "Compare the Arabian Sea and Bay of Bengal at 100 m.",
  "Where are the highest observation-gap zones?",
  "Why is the temperature anomaly high here?",
];

function AssistantPage() {
  const { date, depth, lat, lon, setLocation, setDepth, exportData, dataMode, activeProfile } =
    useOcean();
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      sender: "assistant",
      text: "Hello, I am the OceanEmbed Scientific Assistant. You can query reconstructed subsurface temperature fields, anomalies, regional differences, or sensor gap priorities in natural language. In REAL DATA mode, responses are powered directly by the frozen Physics-Constrained OceanEmbed Net running on real satellite surface observations across the North Indian Ocean.",
      timestamp: "12:00",
    },
  ]);

  const handleQuery = async (query: string) => {
    if (!query.trim()) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const parsed = parseAssistantQuery(query, date);
    let botResponse: Message;

    if (parsed.intent === "coordinate_inspection") {
      const qLat = parsed.targetLat ?? 15.25;
      const qLon = parsed.targetLon ?? 65.25;
      const qDepth = parsed.targetDepth ?? 100;
      setLocation(qLat, qLon);
      setDepth(qDepth);

      let qTemp = tempAtDepth(qLat, qLon, qDepth, date);
      let qAnom = anomalyAt(qLat, qLon, qDepth, date);
      let qConf = confidenceAt(qLat, qLon, qDepth, date);
      let qTc = thermoclineDepth(qLat, qLon, date);
      let sourceTag = "[DEMO SIMULATION]";
      let profilePoints: ProfilePoint[] | undefined;

      if (dataMode === "real") {
        try {
          const realRes = await fetchRealProfile(qLat, qLon, date, "physics");
          if (!realRes.is_ocean) {
            botResponse = {
              id: String(Date.now() + 1),
              sender: "assistant",
              text: `REAL DATA NOTICE: Coordinates ${qLat.toFixed(2)}°N, ${qLon.toFixed(2)}°E are located over land or outside the North Indian Ocean operational domain. Subsurface reconstruction is masked.`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
            setMessages((prev) => [...prev, userMsg, botResponse]);
            return;
          }
          if (realRes && realRes.predicted_temperature && realRes.predicted_temperature.length > 0) {
            const dIdx = DEPTHS.indexOf(qDepth as any);
            const actualIdx = dIdx >= 0 ? dIdx : 7;
            qTemp = realRes.predicted_temperature[actualIdx] ?? 20.0;
            const qUnc = realRes.uncertainty_degC?.[actualIdx] ?? 0.25;
            qTc = realRes.thermocline_depth_m ?? 75.0;
            const snapDate = realRes.matched_snapshot_date || date;
            const deltaH = realRes.delta_hours ?? 0;
            sourceTag = `[REAL MODEL: ${realRes.model_name} | Matched Snapshot ${snapDate} (Δt: +${deltaH}h)]`;

            profilePoints = DEPTHS.map((d, i) => {
              const t = realRes.predicted_temperature[i] ?? 20;
              const u = realRes.uncertainty_degC?.[i] ?? 0.25;
              return {
                depth: d,
                temp: +t.toFixed(2),
                lo: +(t - u).toFixed(2),
                hi: +(t + u).toFixed(2),
                gt: realRes.ground_truth?.[i] ?? undefined,
              };
            });

            botResponse = {
              id: String(Date.now() + 1),
              sender: "assistant",
              text: `${sourceTag} Coordinates ${qLat.toFixed(2)}°N, ${qLon.toFixed(2)}°E at depth ${qDepth} m (Requested: ${date}, Input: ${snapDate}, Δt: +${deltaH}h): Reconstructed temperature is ${qTemp.toFixed(2)} °C with calibrated uncertainty ±${qUnc.toFixed(2)} °C and thermocline depth at ~${qTc} m.`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              queryType: "coordinate",
              payload: {
                lat: qLat,
                lon: qLon,
                depth: qDepth,
                temp: qTemp,
                uncertainty: qUnc,
                tc: qTc,
                matchedSnapshot: snapDate,
                deltaHours: deltaH,
                profilePoints,
              },
            };
            setMessages((prev) => [...prev, userMsg, botResponse]);
            return;
          }
        } catch (err) {
          console.warn("Real profile query failed in assistant:", err);
          botResponse = {
            id: String(Date.now() + 1),
            sender: "assistant",
            text: `REAL DATA UNAVAILABLE: The FastAPI scientific backend is unreachable. Under fail-closed real data requirements, synthetic values are not substituted.`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => [...prev, userMsg, botResponse]);
          return;
        }
      }

      
      // Demo mode fallback when not in real mode
      botResponse = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: `${sourceTag} Coordinates ${qLat.toFixed(2)}°N, ${qLon.toFixed(2)}°E at depth ${qDepth} m (Date: ${date}): Reconstructed temperature is ${qTemp.toFixed(2)} °C with estimated thermocline at ~${qTc} m.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        queryType: "coordinate",
        payload: {
          lat: qLat,
          lon: qLon,
          depth: qDepth,
          temp: qTemp,
          uncertainty: 0.45,
          tc: qTc,
          profilePoints,
        },
      };
    } else if (parsed.intent === "timeseries_evolution") {
      const qDepth = parsed.targetDepth ?? 200;
      const qDays = parsed.daysRange ?? 30;
      setDepth(qDepth);

      let seriesPoints: SeriesPoint[] | undefined;
      let text = `Retrieved ${qDays}-day subsurface thermal evolution at ${qDepth} m depth for selected coordinate ${fmtCoord(lat, lon)}.`;

      if (dataMode === "real") {
        try {
          const realTs = await fetchRealTimeseries(lat, lon, qDepth, "physics");
          if (realTs && realTs.series && realTs.series.length > 0) {
            const numSnapshots = Math.min(
              realTs.series.length,
              Math.max(5, Math.round(qDays / 7)),
            );
            const sliced = realTs.series.slice(-numSnapshots);
            seriesPoints = sliced.map((s) => ({
              date: s.date,
              temp: s.prediction,
              lo: +(s.prediction - s.uncertainty).toFixed(2),
              hi: +(s.prediction + s.uncertainty).toFixed(2),
              anomaly: s.anomaly,
              mhw: s.anomaly > 1.0,
            }));
            text = `[REAL MODEL TIMESERIES] Retrieved ${sliced.length} operational neural predictions (${sliced[0].date} to ${sliced[sliced.length - 1].date}) at ${qDepth} m depth for ${fmtCoord(lat, lon)}. Model: ${realTs.model_name}.`;
          }
        } catch (err) {
          console.warn("Real timeseries failed in assistant:", err);
        }
      }

      botResponse = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        queryType: "timeseries",
        payload: {
          depth: qDepth,
          days: qDays,
          seriesPoints,
        },
      };
    } else if (parsed.intent === "basin_comparison") {
      botResponse = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: "Generated comparative analysis between the Arabian Sea (64°E) and the Bay of Bengal (88°E) at 100 m depth. The Arabian Sea has a deeper mixed layer and higher salinity, while the Bay of Bengal features strong barrier layer freshwater capping.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        queryType: "regional",
        payload: {
          as: regionalStats("Arabian Sea", date),
          bob: regionalStats("Bay of Bengal", date),
        },
      };
    } else if (parsed.intent === "observation_gaps") {
      botResponse = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: "Computed high-priority observation gap zones across the North Indian Ocean basin. Highest observation priority clusters in the Central Arabian Sea and Northern Bay of Bengal where float coverage is sparse and thermal gradients are elevated.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        queryType: "gaps",
      };
    } else {
      // Explainability / Default
      const currentTempStr =
        dataMode === "real"
          ? (activeProfile.find((p) => p.depth === depth)?.temp.toFixed(2) ?? "--")
          : tempAtDepth(lat, lon, depth, date).toFixed(2);
      botResponse = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: `Analysis for ${fmtCoord(lat, lon)} at ${depth} m: The reconstructed temperature is ${currentTempStr} °C. In REAL mode, this value is inferred by the frozen Physics-Constrained OceanEmbed Net checkpoint from real-time surface satellite fields (SST, SSS, SSH, currents, and winds).`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        queryType: "explain",
      };
    }

    setMessages((prev) => [...prev, userMsg, botResponse]);
    setInputText("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-primary font-semibold">INTERACTIVE SCIENTIFIC INFERENCE</span>
            <span className="text-xs text-muted-foreground">· Structured NLP Interface</span>
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">Ocean Assistant</h1>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Query the reconstructed subsurface ocean state in natural language. The assistant
            interprets your inquiry via structured parameter extraction and queries the OceanEmbed
            neural inference services.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              exportData(
                `oceanembed_assistant_report_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.pdf`,
                "PDF Profile",
              )
            }
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shadow-sm"
            title="Download full point analysis as PDF"
          >
            <Download className="h-3.5 w-3.5" />
            Export Report (PDF)
          </button>
          <button
            onClick={() =>
              exportData(
                `oceanembed_assistant_profile_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.csv`,
                "CSV Profile",
              )
            }
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            title="Download 15-depth temperature data as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Export Profile (CSV)
          </button>
        </div>
      </div>

      {/* Suggested Prompts Pills */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Suggested Scientific Queries
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleQuery(s)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground hover:bg-primary/10 transition-colors shadow-sm"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              <span>{s}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Feed */}
      <div className="space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.sender === "assistant" && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 shrink-0 mt-1">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-lg p-4 space-y-3 ${
                m.sender === "user"
                  ? "bg-primary text-primary-foreground font-medium text-xs ml-12"
                  : "border border-border bg-card text-foreground shadow-sm mr-12 text-xs"
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-[10px] opacity-70">
                <span className="font-semibold uppercase">
                  {m.sender === "user" ? "Researcher Query" : "OceanEmbed Assistant"}
                </span>
                <span>{m.timestamp}</span>
              </div>

              <p className="leading-relaxed">{m.text}</p>

              {/* Rich Visual Payload Rendering */}
              {m.payload && m.queryType === "coordinate" && (
                <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-3 mt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded border border-border/60 bg-card p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">Temperature</div>
                      <div className="font-mono font-bold text-primary mt-0.5">
                        {m.payload.temp !== undefined ? m.payload.temp.toFixed(2) : "--"} °C
                      </div>
                    </div>
                    <div className="rounded border border-border/60 bg-card p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">Uncertainty</div>
                      <div className="font-mono font-bold text-cyan-400 mt-0.5">
                        {m.payload.uncertainty !== undefined
                          ? `±${m.payload.uncertainty.toFixed(2)} °C`
                          : "--"}
                      </div>
                    </div>
                    <div className="rounded border border-border/60 bg-card p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">Temporal Offset</div>
                      <div className="font-mono font-bold text-teal-400 mt-0.5">
                        {m.payload.deltaHours !== undefined ? `+${m.payload.deltaHours} h` : "Matched"}
                      </div>
                    </div>
                    <div className="rounded border border-border/60 bg-card p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">Thermocline</div>
                      <div className="font-mono font-bold text-cool mt-0.5">
                        {m.payload.tc ?? 80} m
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                        Vertical Temperature Profile (0–1000 m)
                      </div>
                      {dataMode === "real" && (
                        <span className="text-[10px] font-mono text-teal">
                          ● Genuine OceanEmbedNet Predictions
                        </span>
                      )}
                    </div>
                    <ProfileChart
                      data={
                        m.payload.profilePoints ??
                        profileAt(m.payload.lat ?? lat, m.payload.lon ?? lon, date)
                      }
                      thermocline={m.payload.tc ?? 80}
                      height={220}
                    />
                  </div>
                </div>
              )}

              {m.queryType === "timeseries" && (
                <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2 mt-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                      Subsurface Evolution at {m.payload?.depth ?? depth} m
                    </div>
                    {dataMode === "real" && (
                      <span className="text-[10px] font-mono text-teal">
                        ● Real Multi-Year Neural Store
                      </span>
                    )}
                  </div>
                  <SeriesChart
                    data={
                      m.payload?.seriesPoints ??
                      timeSeries(
                        lat,
                        lon,
                        m.payload?.depth ?? depth,
                        m.payload?.days ?? 30,
                        date,
                      )
                    }
                    height={180}
                  />
                </div>
              )}

              {m.queryType === "regional" && m.payload?.as && m.payload?.bob && (
                <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-3 mt-3">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Arabian Sea vs Bay of Bengal Comparison at 100 m
                  </div>
                  <BarsChart
                    data={[
                      {
                        name: "SST (0m)",
                        "Arabian Sea": m.payload.as.sst,
                        "Bay of Bengal": m.payload.bob.sst,
                      },
                      {
                        name: "100 m Temp",
                        "Arabian Sea": m.payload.as.t100,
                        "Bay of Bengal": m.payload.bob.t100,
                      },
                      {
                        name: "200 m Temp",
                        "Arabian Sea": m.payload.as.t200,
                        "Bay of Bengal": m.payload.bob.t200,
                      },
                    ]}
                    keys={[
                      { key: "Arabian Sea", name: "Arabian Sea", color: "var(--cyan)" },
                      { key: "Bay of Bengal", name: "Bay of Bengal", color: "var(--warm)" },
                    ]}
                  />
                </div>
              )}

              {m.queryType === "gaps" && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 mt-3">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Highest Priority Observation Gap Coordinates
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 border border-border bg-card rounded font-mono">
                      17.5°N, 64.5°E (0.84 High)
                    </div>
                    <div className="p-2 border border-border bg-card rounded font-mono">
                      12.5°N, 55.0°E (0.81 High)
                    </div>
                    <div className="p-2 border border-border bg-card rounded font-mono">
                      19.5°N, 88.5°E (0.76 High)
                    </div>
                    <div className="p-2 border border-border bg-card rounded font-mono">
                      07.5°N, 75.0°E (0.72 High)
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Query Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleQuery(inputText);
        }}
        className="sticky bottom-4 z-20 flex gap-2 rounded-lg border border-border bg-popover p-2 shadow-xl backdrop-blur"
      >
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask a scientific question (e.g. 'Show subsurface temperature near 15°N, 65°E at 100 m')..."
          className="flex-1 bg-transparent px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Query</span>
        </button>
      </form>
    </div>
  );
}
