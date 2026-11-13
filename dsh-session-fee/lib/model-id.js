const ACCOUNT_MODEL_PREFIX = "~account:";

/** Unwrap subscriptions' canonical independent-account id for pricing only. */
export function pricingModelId(model) {
  if (!model.startsWith(ACCOUNT_MODEL_PREFIX)) return model;
  const parts = model.slice(ACCOUNT_MODEL_PREFIX.length).split(":");
  if (parts.length !== 2) return model;
  try {
    const account = decodeURIComponent(parts[0]);
    const underlying = decodeURIComponent(parts[1]);
    if (!account || !underlying) return model;
    if (`${ACCOUNT_MODEL_PREFIX}${encodeURIComponent(account)}:${encodeURIComponent(underlying)}` !== model) return model;
    return underlying;
  } catch {
    return model;
  }
}
