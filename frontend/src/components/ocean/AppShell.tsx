import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  BrainCircuit,
  Compass,
  Gauge,
  Radar,
  Search,
  Waves,
  ShieldCheck,
  CloudSun,
  Database,
  Menu,
  X,
  Download,
  Sparkles,
  ChevronDown,
  Cpu,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { useOcean } from "@/lib/ocean/state";
import { REGIONS, RECONSTRUCTION_DATE, EARLIEST_RECONSTRUCTION_DATE, type RegionId } from "@/lib/ocean/data";
import { VERSION_CONFIG } from "@/lib/ocean/config";
import { checkBackendHealth, type BackendHealthResponse } from "@/lib/ocean/api";
import { ExplainabilityDrawer } from "./ExplainabilityDrawer";
import { ExportModal } from "./ExportModal";
import { AdrishtaLogo } from "./AdrishtaLogo";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", num: "01", label: "Overview", icon: Gauge, title: "North Indian Ocean Intelligence" },
  { to: "/explorer", num: "02", label: "Explore", icon: Compass, title: "Ocean Explorer & Spatial Fields" },
  {
    to: "/validation",
    num: "03",
    label: "Validate",
    icon: ShieldCheck,
    title: "ARGO In-Situ Validation & Matchups",
  },
  {
    to: "/intelligence",
    num: "04",
    label: "Intelligence",
    icon: Radar,
    title: "Ocean Intelligence & Anomalies",
  },
  {
    to: "/climate",
    num: "05",
    label: "Events & Context",
    icon: CloudSun,
    title: "Climate & Ocean Context",
  },
  {
    to: "/assistant",
    num: "06",
    label: "Assistant",
    icon: Bot,
    title: "Ocean AI Assistant (Scientific NLP)",
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => n.to === pathname) ?? NAV[0];
  const {
    dataMode,
    setDataMode,
    date,
    setDate,
    region,
    setRegion,
    setExplainOpen,
    setExportOpen,
    validationMode,
  } = useOcean();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [backendHealth, setBackendHealth] = useState<BackendHealthResponse | null>(null);
  const [isCheckingBackend, setIsCheckingBackend] = useState(false);

  // Poll backend health status
  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      setIsCheckingBackend(true);
      const res = await checkBackendHealth();
      if (mounted) {
        setBackendHealth(res);
        setIsCheckingBackend(false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop Persistent Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex z-30">
        {/* Branding with Custom ADRISHTA Logo */}
        <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-3.5">
          <AdrishtaLogo size={36} showText={true} />
        </div>

        {/* Domain and Prototype Indicator in Sidebar */}
        <div className="px-3 py-2.5 border-b border-sidebar-border/80 bg-muted/10">
          <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-muted-foreground">
            <span>Domain / Resolution</span>
            <span className="rounded px-1.5 py-0.5 font-mono font-bold text-[9px] bg-primary/20 text-primary border border-primary/40">
              0.25° × 0.25°
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Environment</span>
            <span className="font-mono text-[9px] text-foreground font-medium">North Indian Ocean</span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 space-y-1 p-2.5 overflow-y-auto">
          {NAV.map((item) => {
            const isActive = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors group",
                  isActive
                    ? "bg-sidebar-accent text-primary shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground/60">{item.num}</span>
              </Link>
            );
          })}
        </nav>

        {/* Data Status footer */}
        <div className="space-y-2 border-t border-sidebar-border p-3.5 text-xs">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Data Status
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-teal">
              <span className="h-2 w-2 rounded-full bg-teal animate-pulse" />
              <span>{dataMode === "real" ? "REAL DATA ENGINE" : "DEMO DATA MODE"}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Coverage:</span>
              <span className="font-mono text-foreground">142 weekly snapshots</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Latest Synoptic:</span>
              <span className="font-mono text-foreground">27 Sep 2026</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Grid / Depths:</span>
              <span className="font-mono text-foreground">0.25° · 15 standard tiers</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur" suppressHydrationWarning>
          {/* Left: Mobile Toggle & Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden rounded border border-border p-1.5 text-muted-foreground hover:text-foreground" suppressHydrationWarning
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-sm font-bold text-foreground">
                  {current.title}
                </h1>
                {/* Concise Scientific Status Indicator */}
                <button
                  onClick={() => setDataMode(dataMode === "mock" ? "real" : "mock")}
                  className={cn(
                    "hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono border transition-all hover:opacity-90",
                    dataMode === "real"
                      ? "bg-teal/10 text-teal border-teal/30"
                      : "bg-primary/10 text-primary border-primary/30",
                  )}
                  title="Click to toggle between Real Observation Data and Synthetic Demo Data" suppressHydrationWarning
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      dataMode === "real" ? "bg-teal animate-pulse" : "bg-primary",
                    )}
                  />
                  <span className="font-bold">
                    {dataMode === "real" ? "? REAL DATA" : "? DEMO DATA"}
                  </span>
                  <span className="text-muted-foreground/80 font-sans border-l border-border/60 pl-1.5 text-[9px]">
                    {dataMode === "real" ? `Multi-Year (2024–2026) | ${date}` : "Synthetic prototype data"}
                  </span>
                </button>
                
              </div>
              <p className="hidden sm:block truncate text-[11px] text-muted-foreground">
                Satellite embedding-driven subsurface temperature reconstruction · 5°N–30°N,
                45°E–105°E
              </p>
            </div>
          </div>

          {/* Right: Controls & Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Search */}
            <div className="relative hidden xl:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search lat, lon, float, event…"
                className="w-48 rounded-md border border-border bg-muted/30 py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Region Selector */}
            <div className="hidden md:flex items-center gap-1">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as RegionId)}
                className="rounded-md border border-border bg-muted/30 py-1.5 px-2 text-xs text-foreground focus:border-primary focus:outline-none" suppressHydrationWarning
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r} className="bg-popover text-foreground">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selector */}
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={date}
                min={EARLIEST_RECONSTRUCTION_DATE}
                max={RECONSTRUCTION_DATE}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-border bg-muted/30 py-1.5 px-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                suppressHydrationWarning
              />
            </div>

            {/* Compact Validation Mode Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 text-[10px] font-mono font-medium text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
              {validationMode}
            </div>

            {/* Quick Action: Why this prediction? */}
            <button
              onClick={() => setExplainOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              title="Inspect model architecture and feature specifications" suppressHydrationWarning
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Model Details</span>
            </button>

            {/* Quick Action: Export */}
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              title="Export scientific datasets" suppressHydrationWarning
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-border bg-sidebar p-3 space-y-2 animate-in slide-in-from-top-4">
            <div className="px-2 py-1.5 border-b border-sidebar-border/60 mb-2">
              <AdrishtaLogo size={28} showText={true} />
            </div>
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  pathname === item.to
                    ? "bg-sidebar-accent text-primary font-semibold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>
                  {item.num}. {item.label}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Global Modals & Drawers */}
      <ExplainabilityDrawer />
      <ExportModal />
    </div>
  );
}
