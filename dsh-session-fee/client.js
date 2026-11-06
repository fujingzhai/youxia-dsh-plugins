window.__ModuleLoader__.load({
  id: "dsh-session-fee",
  factory(require) {
    const React = require("react");
    const ReactDOM = require("react-dom");
    const h = React.createElement;
    const NS = "session-fee";
    const CURRENCY_SYMBOLS = {
      CNY: "¥",
      USD: "$",
      EUR: "€",
      GBP: "£",
      JPY: "¥",
      KRW: "₩",
      HKD: "HK$",
      TWD: "NT$"
    };

    const zh = {
      "cost.aria": "Tokens 成本（按市价）：{cost}，点击查看明细",
      "cost.title": "Tokens 成本（按市价）",
      "cost.own": "主会话",
      "cost.route": "{route}（{names}）",
      "cost.sep": "、",
      "cost.unknownRoute": "未知模型",
      "cost.unknown": "{count} 次未定价，需在 prices.json 为 {route} 配价格",
      "cost.subagents.pill": "({amounts})",
      "cost.loading": "读取中",
      "cost.unavailable": "无数据",
      "cost.none": "未调用模型"
    };
    const en = {
      "cost.aria": "Token cost (market price): {cost}. Click for details",
      "cost.title": "Token cost (market price)",
      "cost.own": "Main session",
      "cost.route": "{route} ({names})",
      "cost.sep": ", ",
      "cost.unknownRoute": "Unknown model",
      "cost.unknown": "{count} unpriced: add {route} to prices.json",
      "cost.subagents.pill": "({amounts})",
      "cost.loading": "loading",
      "cost.unavailable": "no data",
      "cost.none": "no model calls"
    };

    const css = ".dshsc_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}.dshsc_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:min(460px,42vw);color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;cursor:pointer;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}.dshsc_pill:hover,.dshsc_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dshsc_pill svg{flex:none;width:14px;height:14px}.dshsc_label{text-overflow:ellipsis;min-width:0;overflow:hidden}[data-composer-dock]>span{order:1}[data-composer-dock] [data-composer-stat=cost]{order:2}.dshsc_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);max-height:min(70vh,560px);overflow:auto;backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}.dshsc_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}.dshsc_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}.dshsc_titleLabel svg{flex:none;width:14px;height:14px}.dshsc_titleValue{font-variant-numeric:tabular-nums;text-align:right}.dshsc_rule{border-top:.5px solid var(--dsw-alias-border-l2);margin:10px 0}.dshsc_rule:first-child{margin-top:0}.dshsc_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}.dshsc_details dt,.dshsc_details dd{min-width:0;margin:0}.dshsc_details dt{overflow-wrap:anywhere}.dshsc_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.dshsc_meta{grid-column:1/-1;overflow-wrap:anywhere;margin-top:-4px;color:var(--dsw-alias-label-tertiary);opacity:.85}.dshsc_details .dshsc_route{margin-top:-4px;color:var(--dsw-alias-label-tertiary);opacity:.85}.dshsc_details .dshsc_spaced{margin-top:6px}.dshsc_strong{color:var(--dsw-alias-label-secondary)}";

    function decimal(amount) {
      const maximumFractionDigits = amount > 0 && amount < 0.01 ? 6 : 4;
      return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits });
    }

    function money(currency, amount) {
      return `${CURRENCY_SYMBOLS[currency] ?? `${currency} `}${decimal(amount)}`;
    }

    function routeName(segment, t) {
      if (segment.provider === "" && segment.model === "") return t("cost.unknownRoute");
      return `${segment.provider}/${segment.model}`;
    }

    /** Add one cost view's amounts into a currency → amount map (insertion order kept). */
    function addAmounts(sums, value) {
      for (const segment of value?.segments ?? []) {
        for (const entry of segment.amounts) sums.set(entry.currency, (sums.get(entry.currency) ?? 0) + entry.amount);
      }
      return sums;
    }

    const sumsText = (sums) => [...sums].map(([currency, amount]) => money(currency, amount)).join(" + ");
    const hasUnknown = (value) => (value?.segments ?? []).some((segment) => segment.unknownCalls > 0);
    /** Amounts of a cost view per currency, plus "--" when some calls are unpriced. */
    const viewText = (value) => [sumsText(addAmounts(new Map(), value)), hasUnknown(value) ? "--" : ""].filter((part) => part !== "").join(" + ");

    /** "provider/model（price names）" for one model run. */
    function routeLabel(segment, t) {
      const route = routeName(segment, t);
      return segment.rules.length === 0 ? route : t("cost.route", { route, names: segment.rules.join(t("cost.sep")) });
    }

    /** Own segments in call order: one amount per model run, "--" where a run has unpriced calls. */
    function ownLabel(value) {
      const parts = [];
      for (const segment of value?.segments ?? []) {
        for (const amount of segment.amounts) parts.push(money(amount.currency, amount.amount));
        if (segment.unknownCalls > 0) parts.push("--");
      }
      return parts.join(" + ");
    }

    /**
     * Walk the subagent tree below `rootId` (depth-first, catalog order) using the
     * client's per-session projection snapshots. External children are leaves
     * without a local log, so they are skipped.
     */
    function subagentTree(rootId, projectionsBySession) {
      const nodes = [];
      const seen = new Set([rootId]);
      const visit = (parentId, depth, top) => {
        const entries = projectionsBySession[parentId]?.values?.subagentCatalog;
        if (!Array.isArray(entries)) return;
        for (const entry of entries) {
          if (entry === null || typeof entry !== "object" || typeof entry.id !== "string" || entry.mode === "external" || seen.has(entry.id)) continue;
          seen.add(entry.id);
          const snapshot = projectionsBySession[entry.id];
          const node = {
            id: entry.id,
            label: typeof entry.label === "string" && entry.label !== "" ? entry.label : entry.id,
            depth,
            createdAt: typeof entry.createdAt === "number" ? entry.createdAt : void 0,
            top: top ?? entry.id,
            state: snapshot?.state,
            cost: snapshot?.values?.sessionCost
          };
          nodes.push(node);
          visit(entry.id, depth + 1, node.top);
        }
      };
      visit(rootId, 1, void 0);
      const sums = new Map();
      // One group per direct child (its whole subtree), placed by the child's spawn time.
      const groups = new Map();
      let unknown = false;
      let pending = 0;
      for (const node of nodes) {
        if (!groups.has(node.top)) groups.set(node.top, { createdAt: node.createdAt, sums: new Map() });
        if (node.cost === void 0) {
          pending += 1;
          continue;
        }
        addAmounts(sums, node.cost);
        addAmounts(groups.get(node.top).sums, node.cost);
        if (hasUnknown(node.cost)) unknown = true;
      }
      return { nodes, sums, groups: [...groups.values()], unknown, pending };
    }

    /** The own segment a subagent group joins: the run active at spawn time, else the nearest run in that currency. */
    function targetSegment(runs, createdAt, currency) {
      if (runs.length === 0) return null;
      let active = 0;
      if (createdAt !== void 0) runs.forEach((run, index) => {
        if (run.firstTime <= createdAt) active = index;
      });
      for (let distance = 0; distance < runs.length; distance += 1) {
        for (const index of distance === 0 ? [active] : [active - distance, active + distance]) {
          if (runs[index]?.sums.has(currency)) return runs[index];
        }
      }
      return null;
    }

    /**
     * Pill text. Outside the parentheses is the whole spend, one amount per own
     * model run joined by " + " (a subagent's cost is added to the run it was
     * spawned in); inside is the part of it spent by subagents, e.g.
     * "¥137.04 (¥30.62)" = ¥137.04 in total, of which ¥30.62 by subagents.
     * Inside the parentheses " + " only separates currencies.
     */
    function pillText(own, tree, t) {
      if (tree.nodes.length === 0) return ownLabel(own);
      const runs = (own?.segments ?? []).map((segment) => ({
        firstTime: segment.firstTime,
        sums: addAmounts(new Map(), { segments: [segment] }),
        unknown: segment.unknownCalls > 0
      }));
      const extra = new Map();
      for (const group of tree.groups) {
        for (const [currency, amount] of group.sums) {
          const target = targetSegment(runs, group.createdAt, currency);
          const sums = target === null ? extra : target.sums;
          sums.set(currency, (sums.get(currency) ?? 0) + amount);
        }
      }
      const outside = [];
      for (const run of runs) {
        for (const [currency, amount] of run.sums) outside.push(money(currency, amount));
        if (run.unknown) outside.push("--");
      }
      for (const [currency, amount] of extra) outside.push(money(currency, amount));
      const inside = [...tree.sums].map(([currency, amount]) => money(currency, amount));
      if (tree.unknown) inside.push("--");
      if (inside.length === 0 && tree.pending > 0) inside.push("…");
      if (inside.length === 0) return outside.join(" + ");
      return [outside.join(" + "), t("cost.subagents.pill", { amounts: inside.join(" + ") })].filter((part) => part !== "").join(" ");
    }

    /**
     * Rows for the details panel: the main session, then each subagent
     * (indented by depth). An entry is its name and amount, then its model
     * run as "provider/model（price names）"; runs show their own amounts only
     * when the entry switched models. Kinds: entry, route, meta, rule.
     */
    function dialogRows(own, tree, t) {
      const rows = [];
      const entry = (label, value, indent, spaced) => {
        const segments = value?.segments ?? [];
        rows.push({ kind: "entry", label: indent + label, value: segments.length === 0 ? t("cost.none") : viewText(value), spaced });
        for (const segment of segments) {
          rows.push({ kind: "route", label: indent + routeLabel(segment, t), value: segments.length > 1 ? viewText({ segments: [segment] }) : "" });
          if (segment.unknownCalls > 0) rows.push({ kind: "meta", label: indent + t("cost.unknown", { count: segment.unknownCalls, route: routeName(segment, t) }) });
        }
      };
      entry(t("cost.own"), own, "", false);
      if (tree.nodes.length > 0) rows.push({ kind: "rule" });
      tree.nodes.forEach((node, index) => {
        const indent = "\u2003".repeat(node.depth - 1);
        if (node.cost !== void 0) return entry(node.label, node.cost, indent, index > 0);
        const loading = node.state === "loading" || node.state === "idle" || node.state === void 0;
        rows.push({ kind: "entry", label: indent + node.label, value: t(loading ? "cost.loading" : "cost.unavailable"), spaced: index > 0 });
      });
      return rows;
    }

    /** Panel title value: everything spent, per currency (own runs plus subagents). */
    function grandTotal(own, tree) {
      const all = addAmounts(new Map(), own);
      for (const [currency, amount] of tree.sums) all.set(currency, (all.get(currency) ?? 0) + amount);
      return sumsText(all);
    }

    /** A receipt (bill) with a torn edge, drawn on DSH's own icon grid (16px, 1px stroke, currentColor). */
    function CostIcon() {
      const line = { stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };
      return h("svg", { viewBox: "0 0 16 16", fill: "none", strokeWidth: 1, "aria-hidden": true },
        h("path", { d: "M3.5 1.75H12.5V14.25L11 13.25L9.5 14.25L8 13.25L6.5 14.25L5 13.25L3.5 14.25Z", ...line }),
        h("path", { d: "M5.75 5H10.25", ...line }),
        h("path", { d: "M5.75 7.5H10.25", ...line }),
        h("path", { d: "M5.75 10H8.5", ...line }));
    }

    const PANEL_GAP = 8;
    const PANEL_MARGIN = 12;

    /** Open state, placement above the trigger (clamped to the viewport), and outside-click / Escape to close. */
    function useDialog() {
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      React.useLayoutEffect(() => {
        if (!open) {
          setPos(null);
          return void 0;
        }
        const place = () => {
          const anchor = rootRef.current?.getBoundingClientRect();
          const panel = panelRef.current;
          if (anchor === void 0 || panel === null) return;
          const width = panel.offsetWidth;
          const height = panel.offsetHeight;
          const left = Math.min(Math.max(PANEL_MARGIN, anchor.left), window.innerWidth - width - PANEL_MARGIN);
          const above = anchor.top - PANEL_GAP - height;
          const top = above >= PANEL_MARGIN ? above : Math.min(anchor.bottom + PANEL_GAP, window.innerHeight - height - PANEL_MARGIN);
          setPos({ left: Math.max(PANEL_MARGIN, left), top: Math.max(PANEL_MARGIN, top) });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
          window.removeEventListener("resize", place);
          window.removeEventListener("scroll", place, true);
        };
      }, [open]);
      React.useEffect(() => {
        if (!open) return void 0;
        const inside = (target) => target instanceof Node && (rootRef.current?.contains(target) === true || panelRef.current?.contains(target) === true);
        const onKeyDown = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        const onPointerDown = (event) => {
          if (!inside(event.target)) setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => {
          document.removeEventListener("keydown", onKeyDown);
          document.removeEventListener("pointerdown", onPointerDown, true);
        };
      }, [open]);
      return { open, setOpen, rootRef, panelRef, pos };
    }

    function CostPanel({ own, tree, total, panelRef, pos, t }) {
      const rows = dialogRows(own, tree, t);
      const children = [];
      rows.forEach((row, index) => {
        if (row.kind === "rule") {
          children.push(h("div", { key: index, className: "dshsc_rule", style: { gridColumn: "1 / -1", margin: "4px 0" }, "aria-hidden": true }));
        } else if (row.kind === "meta" || row.kind === "route" && row.value === "") {
          children.push(h("div", { key: index, className: "dshsc_meta" }, row.label));
        } else {
          const className = row.kind === "route" ? "dshsc_route" : row.spaced ? "dshsc_strong dshsc_spaced" : "dshsc_strong";
          children.push(h("dt", { key: `${index}t`, className }, row.label), h("dd", { key: `${index}d`, className }, row.value));
        }
      });
      return h("div", {
        ref: panelRef,
        className: "dshsc_panel",
        role: "dialog",
        "aria-label": t("cost.title"),
        style: pos ?? { visibility: "hidden", left: 0, top: 0 }
      },
      h("div", { className: "dshsc_title" },
        h("span", { className: "dshsc_titleLabel" }, h(CostIcon), t("cost.title")),
        h("span", { className: "dshsc_titleValue" }, total)),
      h("div", { className: "dshsc_rule", "aria-hidden": true }),
      h("dl", { className: "dshsc_details" }, children));
    }

    const EMPTY = {};
    const noSessions = () => EMPTY;
    const selectProjections = (state) => state?.projectionsBySession ?? EMPTY;

    const CostPill = React.memo(function CostPill({ sessionId, useProjection, useSessions, refreshProjections, t }) {
      const own = useProjection("sessionCost");
      const projections = (useSessions ?? noSessions)(selectProjections);
      const tree = React.useMemo(() => subagentTree(sessionId, projections ?? EMPTY), [sessionId, projections]);
      const requested = React.useRef(new Set());
      React.useEffect(() => {
        if (typeof refreshProjections !== "function") return;
        for (const node of tree.nodes) {
          // Cold children are read once; running children then stream live frames.
          if (node.cost !== void 0 || node.state === "loading" || node.state === "ready" || requested.current.has(node.id)) continue;
          requested.current.add(node.id);
          Promise.resolve().then(() => refreshProjections(node.id)).catch(() => {});
        }
      }, [tree, refreshProjections]);
      const dialog = useDialog();
      const text = pillText(own, tree, t);
      if (text === "") return null;
      return h("span", {
        ref: dialog.rootRef,
        className: "dshsc_anchor",
        "data-composer-stat": "cost"
      }, h("button", {
        type: "button",
        className: "dshsc_pill",
        "aria-haspopup": "dialog",
        "aria-expanded": dialog.open,
        "aria-label": t("cost.aria", { cost: text }),
        onClick: () => dialog.setOpen(!dialog.open)
      }, h(CostIcon), h("span", { className: "dshsc_label" }, text)),
      dialog.open && typeof document !== "undefined"
        ? ReactDOM.createPortal(h(CostPanel, { own, tree, total: grandTotal(own, tree), panelRef: dialog.panelRef, pos: dialog.pos, t }), document.body)
        : null);
    });

    const testHook = globalThis.__DSH_SESSION_COST_TEST__;
    if (testHook !== void 0) Object.assign(testHook, { subagentTree, pillText, dialogRows, grandTotal, ownLabel, zh, en });

    return {
      inject: ["slots", "locale", "sessions"],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-session-fee: dictionaries");
        ctx.effect(() => {
          if (typeof document === "undefined") return void 0;
          const style = document.createElement("style");
          style.dataset.plugin = "dsh-session-fee";
          style.textContent = css;
          document.head.appendChild(style);
          return () => style.remove();
        }, "dsh-session-fee: styles");
        const actions = () => ({
          refreshProjections(sessionId) {
            return ctx.sessions.refreshProjections(sessionId);
          }
        });
        ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
          name: "conversation.composer.dock",
          id: "cost",
          order: 2,
          locale: NS,
          inject: actions
        }, CostPill));
      }
    };
  }
});
