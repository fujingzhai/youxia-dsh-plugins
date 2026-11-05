window.__ModuleLoader__.load({
  id: "dsh-zh-slash",
  factory(require) {
    const React = require("react");
    const { createElement: h, useLayoutEffect, useReducer, useRef } = React;

    function isComposing(event, guard, input) {
      return guard.composing || event?.isComposing === true ||
        input?.hasAttribute("data-composer-composing") === true;
    }

    /** Replace only the edited prefix, retaining the caret and later reference chips. */
    function normalize(state, actions, input, guard) {
      if (state.phase !== "plain" || !state.draft.startsWith("、") ||
          guard.history || isComposing(null, guard, input) ||
          input?.getAttribute("contenteditable") !== "true" ||
          input.ownerDocument.activeElement !== input) return false;
      const span = actions.captureInsertion();
      if (span.draftRev !== state.draftRev || span.start !== span.end || span.end < 1 ||
          state.occurrences.some((item) => item.start < span.end)) return false;
      return actions.insertText(`/${state.draft.slice(1, span.end)}`, {
        start: 0,
        end: span.end,
        draftRev: span.draftRev
      });
    }

    function ChineseSlashTrigger({ useInput, inputActions }) {
      const state = useInput((value) => value);
      const anchor = useRef(null);
      const current = useRef({ state, actions: inputActions });
      current.current = { state, actions: inputActions };
      const guard = useRef({ composing: false, history: false });
      const [compositionCommit, commitComposition] = useReducer((value) => value + 1, 0);

      useLayoutEffect(() => {
        const card = anchor.current?.closest("[data-composer-card]");
        if (!card) return undefined;
        const inputOf = (target) => target?.closest?.("[data-composer-input]");
        const beforeInput = (event) => {
          const input = inputOf(event.target);
          if (!input || input.closest("[data-composer-card]") !== card) return;
          guard.current.history = event.inputType === "historyUndo" || event.inputType === "historyRedo";
          const { state: snapshot, actions } = current.current;
          if (guard.current.history || snapshot.phase !== "plain" ||
              isComposing(event, guard.current, input) ||
              input.getAttribute("contenteditable") !== "true" ||
              !event.cancelable || !["insertText", "insertReplacementText"].includes(event.inputType) ||
              !event.data?.startsWith("、")) return;
          const span = actions.captureInsertion();
          if (span.start !== 0 || span.draftRev !== snapshot.draftRev) return;
          if (actions.insertText(`/${event.data.slice(1)}`, span)) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        };
        const compositionStart = (event) => {
          if (!inputOf(event.target)) return;
          guard.current.composing = true;
          guard.current.history = false;
        };
        const compositionEnd = (event) => {
          if (!inputOf(event.target)) return;
          guard.current.composing = false;
          // Let Lexical commit the final IME text before the layout check.
          queueMicrotask(commitComposition);
        };
        const paste = (event) => {
          if (inputOf(event.target)) guard.current.history = false;
        };
        // Card capture sees beforeinput before Lexical, without taking over its editor.
        card.addEventListener("beforeinput", beforeInput, true);
        card.addEventListener("compositionstart", compositionStart, true);
        card.addEventListener("compositionend", compositionEnd);
        card.addEventListener("paste", paste, true);
        return () => {
          card.removeEventListener("beforeinput", beforeInput, true);
          card.removeEventListener("compositionstart", compositionStart, true);
          card.removeEventListener("compositionend", compositionEnd);
          card.removeEventListener("paste", paste, true);
        };
      }, [inputActions]);

      useLayoutEffect(() => {
        const input = anchor.current?.closest("[data-composer-card]")?.querySelector("[data-composer-input]");
        normalize(state, inputActions, input, guard.current);
      }, [state, inputActions, compositionCommit]);

      return h("span", { ref: anchor, hidden: true, "data-zh-slash": true });
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
          name: "conversation.input.overlay",
          id: "zh-slash",
          order: -100
        }, ChineseSlashTrigger));
      }
    };
  }
});
