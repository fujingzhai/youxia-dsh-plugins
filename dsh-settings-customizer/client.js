window.__ModuleLoader__.load({
  id: "dsh-settings-customizer",
  factory(require) {
    const SECTION = "settings.section";
    const ICON = "settings.section.icon";
    const BUMP = "dsh-settings-customizer-bump";
    const OFFICIAL = new Set([
      "account", "general", "models", "plugins", "agent-presets", "archived-sessions"
    ]);

    // 公共默认没有个人规则；实际配置来自 DSH profile。
    const RULES = {};

    // 内置描边图标；也可以在规则里用 { paths: ["SVG path"], viewBox: "0 0 24 24" }。
    const ICONS = {
      "credit-card": ["M3 5h18v14H3z", "M3 10h18", "M7 15h4"],
      code: ["m8 6-6 6 6 6", "m16 6 6 6-6 6", "m14 3-4 18"],
      bot: ["M5 7h14v13H5z", "M12 3v4", "M9 12h.01M15 12h.01", "M9 16h6", "M2 11v5M22 11v5"],
      globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M3 12h18", "M12 3c5 5 5 13 0 18-5-5-5-13 0-18"],
      star: ["m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"]
    };
    const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

    function createPolicy(rules, { autoOrder = false, extraStart = 40 } = {}) {
      const assigned = new Map();
      let extra = extraStart;
      return {
        desired(id) {
          if (typeof id !== "string" || id === BUMP) return undefined;
          const rule = has(rules, id) ? rules[id] : undefined;
          if (Number.isFinite(rule?.order)) return rule.order;
          if (!autoOrder || OFFICIAL.has(id)) return undefined;
          if (!assigned.has(id)) assigned.set(id, extra++);
          return assigned.get(id);
        }
      };
    }

    function makeIcon(spec) {
      if (typeof spec === "function") return props => spec(props);
      const paths = typeof spec === "string" ? ICONS[spec] : spec?.paths;
      if (!Array.isArray(paths) || paths.length === 0 || paths.some(path => typeof path !== "string")) {
        throw new Error(`dsh-settings-customizer: 无效图标 ${String(spec)}`);
      }
      const viewBox = typeof spec === "object" ? spec.viewBox ?? "0 0 24 24" : "0 0 24 24";
      return function SettingsNavIcon({ size = 16 }) {
        const h = require("react").createElement;
        return h("svg", {
          width: size, height: size, viewBox, fill: "none", stroke: "currentColor",
          strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
          "aria-hidden": true, focusable: false
        }, ...paths.map((d, key) => h("path", { d, key })));
      };
    }

    function project(entries) {
      return entries
        .map(entry => ({ id: entry.options?.id ?? "", order: entry.options?.order ?? 0 }))
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    }

    function install(slots, rules = RULES, options = {}) {
      if (typeof slots?.register !== "function" || slots.register.dshSettingsCustomizer) return () => {};
      const token = {};
      const icons = new Map(Object.entries(rules)
        .filter(([, rule]) => rule?.icon !== undefined)
        .map(([id, rule]) => [id, { component: makeIcon(rule.icon), dispose: undefined, priority: undefined }]));
      const policy = createPolicy(rules, options);
      const original = slots.register;
      const rawRegister = (options, component) => original.call(slots, options, component);
      const saved = new Map();
      const ready = new Set();
      const stops = [];
      let busy = false;
      let stopped = false;

      // 保存原始字段，卸载时只还原仍由本插件控制的值。
      function setField(entry, key, value) {
        if (entry.options[key] === value) return false;
        let fields = saved.get(entry);
        if (!fields) saved.set(entry, fields = new Map());
        const previous = fields.get(key);
        if (!previous || entry.options[key] !== previous.applied) {
          fields.set(key, { had: has(entry.options, key), value: entry.options[key], applied: value });
        } else {
          previous.applied = value;
        }
        entry.options[key] = value;
        return true;
      }

      // 台账没有公开的字段更新接口：用瞬时空项触发版本更新，不留导航项。
      function bump() {
        const dispose = rawRegister({ name: SECTION, id: BUMP, order: 1e9, label: "" }, () => null);
        dispose();
      }

      function retune() {
        if (busy || stopped || typeof slots.entries !== "function") return;
        busy = true;
        try {
          if (ready.has(SECTION)) {
            let changed = false;
            const entries = slots.entries(SECTION) ?? [];
            const live = new Set(entries);
            for (const entry of saved.keys()) if (!live.has(entry)) saved.delete(entry);
            for (const entry of entries) {
              const id = entry.options?.id;
              if (id === BUMP || !entry.options) continue;
              const order = policy.desired(id);
              if (order !== undefined) changed = setField(entry, "order", order) || changed;
              const rule = has(rules, id) ? rules[id] : undefined;
              if (rule?.label !== undefined) changed = setField(entry, "label", rule.label) || changed;
            }
            if (changed) bump();
          }
          if (ready.has(ICON)) {
            for (const [id, icon] of icons) {
              const entries = (slots.entries(ICON) ?? []).filter(entry => entry.options.id === id);
              const own = entries.find(entry => entry.component === icon.component);
              const others = entries.filter(entry => entry !== own);
              const minimum = Math.min(0, ...others.map(entry => entry.options.priority ?? 0));
              if (own && icon.priority < minimum) continue;
              if (icon.dispose) icon.dispose();
              icon.priority = minimum - 1;
              // 官方的优先级遮蔽机制：同 id、较低 priority 胜出；不改动原图标。
              icon.dispose = rawRegister({ name: ICON, id, priority: icon.priority }, icon.component);
            }
          }
        } finally {
          busy = false;
        }
      }

      function register(options, component) {
        const icon = options?.name === ICON ? icons.get(options.id) : undefined;
        // 后来的原图标若刚好使用覆盖项的 priority，先让位再以更低值重新覆盖。
        if (icon?.dispose && icon.priority === (options.priority ?? 0)) {
          const previousBusy = busy;
          busy = true;
          try {
            icon.dispose();
            icon.dispose = undefined;
            return rawRegister(options, component);
          } finally {
            busy = previousBusy;
            retune();
          }
        }
        const dispose = rawRegister(options, component);
        if (options?.name === SECTION || options?.name === ICON) retune();
        return dispose;
      }
      register.dshSettingsCustomizer = token;
      slots.register = register;

      function watch(name) {
        const start = () => {
          ready.add(name);
          // 先订阅，再修正；真实台账通知按微任务合并，测试也覆盖同步通知。
          const unsubscribe = typeof slots.subscribe === "function" ? slots.subscribe(name, retune) : undefined;
          retune();
          return () => {
            if (typeof unsubscribe === "function") unsubscribe();
            ready.delete(name);
            if (name === ICON) {
              for (const icon of icons.values()) {
                if (icon.dispose) icon.dispose();
                icon.dispose = undefined;
              }
            }
          };
        };
        if (typeof slots.inject === "function") stops.push(slots.inject(name, start));
        else stops.push(start());
      }

      function stop() {
        if (stopped) return;
        stopped = true;
        const sectionReady = ready.has(SECTION);
        for (const dispose of stops.reverse()) if (typeof dispose === "function") dispose();
        // Cordis Service Proxy 可能每次返回新的 bound function，不能比较函数引用。
        if (slots.register.dshSettingsCustomizer === token) slots.register = original;
        const live = new Set(slots.entries?.(SECTION) ?? []);
        let changed = false;
        for (const [entry, fields] of saved) {
          if (!live.has(entry)) continue;
          for (const [key, previous] of fields) {
            if (entry.options[key] !== previous.applied) continue;
            if (previous.had) entry.options[key] = previous.value;
            else delete entry.options[key];
            changed = true;
          }
        }
        saved.clear();
        if (changed && sectionReady) bump();
      }

      try {
        watch(SECTION);
        if (icons.size) watch(ICON);
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
    }

    // Host settings 表单是唯一配置来源；不从仓库文件、localStorage 或公开资源取个人规则。
    function bindConfig(slots, form) {
      let stop;
      let fingerprint;
      function refresh() {
        const snapshot = form.getSnapshot();
        if (snapshot.status === "unavailable") {
          if (stop) stop();
          stop = undefined;
          fingerprint = undefined;
          return;
        }
        if (snapshot.status !== "ready" || !snapshot.value) return;
        const { rules = {}, autoOrder = false, extraStart = 40 } = snapshot.value;
        const next = JSON.stringify([rules, autoOrder, extraStart]);
        if (next === fingerprint) return;
        // 先检查图标，错误值不会拆掉当前已接受的配置。
        for (const rule of Object.values(rules)) if (rule.icon !== undefined) makeIcon(rule.icon);
        if (stop) stop();
        stop = install(slots, rules, { autoOrder, extraStart });
        fingerprint = next;
      }
      const unsubscribe = form.subscribe(refresh);
      refresh();
      return () => {
        unsubscribe();
        if (stop) stop();
      };
    }

    const hook = globalThis.__DSH_SETTINGS_CUSTOMIZER_TEST__;
    if (hook !== undefined) Object.assign(hook, { createPolicy, makeIcon, project, install, bindConfig, RULES, OFFICIAL, ICONS });

    return {
      inject: ["slots", "configForms"],
      apply(ctx) {
        ctx.effect(() => bindConfig(ctx.slots, ctx.configForms.get("settings-customizer")),
          "dsh-settings-customizer: personal configuration");
      }
    };
  }
});
