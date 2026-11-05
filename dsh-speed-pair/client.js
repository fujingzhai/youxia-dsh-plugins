window.__ModuleLoader__.load({
  id: "dsh-speed-pair",
  factory(require) {
    const React = require("react");
    const ReactDOM = require("react-dom");
    const h = React.createElement;
    const NS = "speed-pair";

    const zh = {
      "speed.pair": "{x}({y}) tok/s",
      "speed.single": "{x} tok/s",
      "speed.aria": "输出速度：首字后 {x} tok/s，整段 {y} tok/s，点击查看明细",
      "speed.title": "输出速度",
      "speed.dialogTitle": "会话统计",
      "speed.counts": "{turns} 轮 {steps} 步",
      "speed.llmTime": "模型用时",
      "speed.toolTime": "工具调用用时",
      "speed.ttft": "首 token 平均（TTFT）",
      "speed.decodeTime": "生成用时",
      "speed.x": "首字后速度",
      "speed.y": "整段速度（含首字）",
      "speed.empty": "暂无用量",
      "dur.seconds": "{seconds}秒",
      "dur.minutes": "{minutes}分{seconds}秒",
      "dur.milliseconds": "{milliseconds}毫秒"
    };

    const en = {
      "speed.pair": "{x}({y}) tok/s",
      "speed.single": "{x} tok/s",
      "speed.aria": "Output speed: {x} tok/s after first token, {y} tok/s end to end. Click for details",
      "speed.title": "Output speed",
      "speed.dialogTitle": "Session stats",
      "speed.counts": "{turns} turns, {steps} steps",
      "speed.llmTime": "Model time",
      "speed.toolTime": "Tool time",
      "speed.ttft": "Mean first token (TTFT)",
      "speed.decodeTime": "Generation time",
      "speed.x": "After first token",
      "speed.y": "End to end (with TTFT)",
      "speed.empty": "No usage yet",
      "dur.seconds": "{seconds}s",
      "dur.minutes": "{minutes}m{seconds}s",
      "dur.milliseconds": "{milliseconds}ms"
    };

    const css = [
      /* 顶替自带 activity 项：只在本插件那颗确实在位时才隐藏宿主那颗，
         插件被停用或组件崩掉时自带的读数照旧在，不会两头落空 */
      '[data-composer-dock]:has([data-composer-stat="speed"]) [data-composer-stat="activity"]{display:none}',
      '[data-composer-dock] [data-composer-stat="speed"]{order:0}',
      ".dshsp_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}",
      ".dshsp_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;cursor:pointer;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}",
      ".dshsp_pill:hover,.dshsp_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".dshsp_pill svg{flex:none;width:14px;height:14px}",
      ".dshsp_label{text-overflow:ellipsis;min-width:0;overflow:hidden}",
      ".dshsp_sep{color:var(--dsw-alias-separator-primary);margin:0 6px}",
      ".dshsp_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(460px,100vw - 24px);max-height:min(70vh,560px);overflow:auto;backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}",
      ".dshsp_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}",
      ".dshsp_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}",
      ".dshsp_titleLabel svg{flex:none;width:14px;height:14px}",
      ".dshsp_titleValue{font-variant-numeric:tabular-nums;text-align:right}",
      ".dshsp_rule{border-top:.5px solid var(--dsw-alias-border-l2);margin:10px 0}",
      ".dshsp_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(96px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}",
      ".dshsp_details dt,.dshsp_details dd{min-width:0;margin:0}",
      ".dshsp_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}",
    ].join("");

    /** 两位有效显示：十以上取整，以下留一位小数。与自带口径一致。 */
    function formatTps(tps) {
      const clamped = Math.max(0, tps);
      return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
    }

    function formatDuration(ms, t) {
      const total = Math.max(0, ms);
      if (total < 1000) return t("dur.milliseconds", { milliseconds: Math.round(total) });
      const seconds = total / 1000;
      if (seconds < 60) return t("dur.seconds", { seconds: Math.round(seconds * 10) / 10 });
      const whole = Math.round(seconds);
      return t("dur.minutes", { minutes: Math.floor(whole / 60), seconds: whole % 60 });
    }

    /**
     * 一颗 pill 两个口径，全部取自宿主 sessionStats 投影：
     * decodeTokens/decodeMs 是自带那颗的算法（首 token→收完），
     * llmMs 是每步「请求发出→收完」之和，配上同一批输出 token 即 pi 底栏口径。
     */
    function pairOf(stats) {
      if (stats === undefined || stats === null) return null;
      const out = stats.decodeTokens;
      const decodeMs = stats.decodeMs;
      if (!(out > 0) || !(decodeMs > 0)) return null;
      const x = out / (decodeMs / 1000);
      const y = stats.llmMs > 0 ? out / (stats.llmMs / 1000) : null;
      return { out, x, y: y === null ? null : Math.min(y, x) };
    }

    const pairText = (pair, t) =>
      pair.y === null
        ? t("speed.single", { x: formatTps(pair.x) })
        : t("speed.pair", { x: formatTps(pair.x), y: formatTps(pair.y) });

    /** DSH 自带「会话统计」那颗 pill 的表盘图标，路径照抄宿主（16 网格、regular 线宽）。 */
    function GaugeIcon() {
      const stroke = { stroke: "currentColor" };
      return h(
        "svg",
        { viewBox: "0 0 16 16", fill: "none", strokeWidth: 1, "aria-hidden": true },
        h("path", {
          d: "M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096",
          ...stroke
        }),
        h("path", { d: "M8 8.49994L11.6114 4.88855", ...stroke }),
        h("path", {
          d: "M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z",
          fill: "currentColor"
        })
      );
    }

    /** 底栏是否显示「几轮几步」。嫌长就改成 false，只留 X(Y) tok/s。 */
    const SHOW_COUNTS = true;

    const PANEL_GAP = 8;
    const PANEL_MARGIN = 12;

    /** 向上弹出、夹在视口内，Esc 与点击外部关闭。与宿主同类面板行为一致。 */
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
        const inside = (target) =>
          target instanceof Node && (rootRef.current?.contains(target) === true || panelRef.current?.contains(target) === true);
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

    function Row({ label, value }) {
      if (value === null || value === undefined || value === "") return null;
      return h(React.Fragment, null, h("dt", null, label), h("dd", null, value));
    }

    function SpeedPanel({ stats, pair, panelRef, pos, t }) {
      const rows = [];
      rows.push(h(Row, { key: "llm", label: t("speed.llmTime"), value: stats?.llmMs > 0 ? formatDuration(stats.llmMs, t) : null }));
      rows.push(h(Row, { key: "tool", label: t("speed.toolTime"), value: stats?.toolMs > 0 ? formatDuration(stats.toolMs, t) : null }));
      rows.push(h(Row, { key: "ttft", label: t("speed.ttft"), value: stats?.ttftSteps > 0 ? formatDuration(stats.ttftMs / stats.ttftSteps, t) : null }));
      rows.push(h(Row, { key: "decode", label: t("speed.decodeTime"), value: stats?.decodeMs > 0 ? formatDuration(stats.decodeMs, t) : null }));
      rows.push(h(Row, { key: "x", label: t("speed.x"), value: pair === null ? null : t("speed.single", { x: formatTps(pair.x) }) }));
      rows.push(h(Row, { key: "y", label: t("speed.y"), value: pair === null || pair.y === null ? null : t("speed.single", { x: formatTps(pair.y) }) }));
      return h(
        "div",
        {
          ref: panelRef,
          className: "dshsp_panel",
          role: "dialog",
          "aria-label": t("speed.dialogTitle"),
          style: pos ?? { visibility: "hidden", left: 0, top: 0 }
        },
        h(
          "div",
          { className: "dshsp_title" },
          h("span", { className: "dshsp_titleLabel" }, h(GaugeIcon), t("speed.dialogTitle")),
          h(
            "span",
            { className: "dshsp_titleValue" },
            stats !== undefined && stats !== null && stats.steps > 0
              ? t("speed.counts", { turns: stats.turns, steps: stats.steps })
              : t("speed.empty")
          )
        ),
        h("div", { className: "dshsp_rule", "aria-hidden": true }),
        h("dl", { className: "dshsp_details" }, rows)
      );
    }

    const SpeedPill = React.memo(function SpeedPill({ useProjection, usePerformanceUsage, t }) {
      const mode = usePerformanceUsage !== undefined ? usePerformanceUsage((value) => value) : "detailed";
      const stats = useProjection("sessionStats");
      const pair = React.useMemo(() => pairOf(stats), [stats]);
      const dialog = useDialog();
      const counted = stats !== undefined && stats !== null && stats.steps > 0;
      const counts = counted ? t("speed.counts", { turns: stats.turns, steps: stats.steps }) : null;
      // 会话还只有工具步骤、没拿到可算的用量时，仍按宿主的样子留着轮/步这颗
      if (pair === null && counts === null) return null;
      const speed = pair === null ? null : pairText(pair, t);
      const single = pair === null || pair.y === null ? null : formatTps(pair.y);
      const compact = mode === "compact" || !SHOW_COUNTS;
      const plain = compact || speed === null || counts === null ? (speed ?? counts ?? "") : `${counts} · ${speed}`;
      const label =
        compact || speed === null || counts === null
          ? speed ?? counts
          : h(React.Fragment, null, counts, h("span", { className: "dshsp_sep", "aria-hidden": true }, "·"), speed);
      return h(
        "span",
        { ref: dialog.rootRef, className: "dshsp_anchor", "data-composer-stat": "speed" },
        h(
          "button",
          {
            type: "button",
            className: "dshsp_pill",
            title: plain,
            "aria-haspopup": "dialog",
            "aria-expanded": dialog.open,
            "aria-label": pair === null ? plain : t("speed.aria", { x: formatTps(pair.x), y: single ?? "" }),
            onClick: () => dialog.setOpen(!dialog.open)
          },
          h(GaugeIcon),
          h("span", { className: "dshsp_label" }, label)
        ),
        dialog.open && typeof document !== "undefined"
          ? ReactDOM.createPortal(
              h(SpeedPanel, { stats, pair, panelRef: dialog.panelRef, pos: dialog.pos, t }),
              document.body
            )
          : null
      );
    });

    const testHook = globalThis.__DSH_SPEED_PAIR_TEST__;
    if (testHook !== undefined) Object.assign(testHook, { pairOf, pairText, formatTps, formatDuration, zh, en, css });

    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-speed-pair: dictionaries");
        ctx.effect(() => {
          if (typeof document === "undefined") return void 0;
          const style = document.createElement("style");
          style.dataset.plugin = "dsh-speed-pair";
          style.textContent = css;
          document.head.appendChild(style);
          return () => style.remove();
        }, "dsh-speed-pair: styles");
        ctx.slots.inject("conversation.composer.dock", () =>
          ctx.slots.register(
            {
              name: "conversation.composer.dock",
              id: "speed",
              order: 0,
              locale: NS
            },
            SpeedPill
          )
        );
      }
    };
  }
});
