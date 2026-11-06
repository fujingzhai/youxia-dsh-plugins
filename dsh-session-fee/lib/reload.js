import { utimesSync, watch } from "node:fs";
import { basename, dirname } from "node:path";

/**
 * Keep one valid pricing registration live. Saving the price book (atomically
 * or in place) re-registers the Host projection, then touches the Client
 * artifact so DSH's Client HMR re-reads the current projection snapshot.
 *
 * `load(path)` builds the whole pricing context; `fingerprint(context)` decides
 * whether anything changed. `onLoad` / `onError` report each outcome.
 */
export function watchPriceBook({
  priceBookPath,
  clientArtifact,
  load,
  register,
  onError,
  fingerprint = (value) => JSON.stringify(value),
  onLoad = () => {}
}) {
  let current = load(priceBookPath);
  let dispose = register(current);
  let stopped = false;
  let timer = null;
  onLoad(current);

  const report = (error) => {
    if (!stopped) onError(error);
  };

  const reload = () => {
    timer = null;
    if (stopped) return;
    try {
      const next = load(priceBookPath);
      if (fingerprint(next) === fingerprint(current)) return;
      dispose();
      dispose = register(next);
      current = next;
      onLoad(next);
      // dsh-client-hmr polls artifact mtime/ctime/size. Content and Git stay
      // unchanged, while the Client re-reads the newly registered projection.
      utimesSync(clientArtifact, new Date(), new Date());
    } catch (error) {
      // A half-written or invalid file never displaces the last good book.
      report(error);
    }
  };

  const directory = dirname(priceBookPath);
  const filename = basename(priceBookPath);
  const watcher = watch(directory, { persistent: false }, (_event, changed) => {
    if (stopped || changed !== null && changed !== filename) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(reload, 180);
  });
  watcher.on("error", report);

  return {
    close() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      watcher.close();
      dispose();
    }
  };
}
