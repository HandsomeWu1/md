// Token 用量与费用估算。
//
// 费用为什么要用户自己填单价、而不是内置价格表：各家定价频繁调整，内置表一定会
// 过期，显示一个过期的金额比不显示更糟（用户会据此做判断）。API 本身也不返回价格。
// 因此设置里提供「每百万 token 单价」，填了才显示金额，留空只显示 token 数。

const PER_MILLION = 1000000;

/** 千分位格式化，避免大数字难读。 */
export function formatTokens(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US');
}

/**
 * 估算本次请求费用。
 * @param {{prompt:number, completion:number, cacheHit?:number, cacheMiss?:number}} usage
 * @param {{ priceIn?: number, priceOut?: number, priceCached?: number }} price 每百万 token 单价
 * @returns {number|null} 无有效单价时返回 null（表示不显示金额）
 */
export function estimateCost(usage, price) {
  if (!usage) return null;
  const pIn = Number(price?.priceIn) || 0;
  const pOut = Number(price?.priceOut) || 0;
  const pCached = Number(price?.priceCached) || 0;
  if (pIn <= 0 && pOut <= 0) return null;

  let inputCost;
  // 命中缓存的输入 token 计费更低。只有同时拿到命中数与缓存单价时才分开计算，
  // 否则一律按标准输入价，宁可略微高估也不要给出偏低的误导性数字。
  if (usage.cacheHit != null && pCached > 0) {
    const hit = Number(usage.cacheHit) || 0;
    const miss = usage.cacheMiss != null ? Number(usage.cacheMiss) || 0 : Math.max(0, usage.prompt - hit);
    inputCost = (hit * pCached + miss * pIn) / PER_MILLION;
  } else {
    inputCost = (usage.prompt * pIn) / PER_MILLION;
  }
  const outputCost = (usage.completion * pOut) / PER_MILLION;
  return inputCost + outputCost;
}

/**
 * 金额格式化。极小额度会被四舍五入成 0，此时显示更多小数位——
 * 单次对话常常只花几分钱，显示「0.00」等于没有信息。
 */
export function formatCost(cost, currency = '¥') {
  if (cost == null) return '';
  if (cost === 0) return `${currency}0`;
  if (cost < 0.0001) return `<${currency}0.0001`;
  const digits = cost < 0.01 ? 4 : cost < 1 ? 3 : 2;
  return currency + cost.toFixed(digits);
}

/**
 * 组装用量摘要文本，供消息下方显示。
 * @returns {string} 例如 "1,234 tokens（输入 1,000 · 输出 234） · ¥0.0021"
 */
export function formatUsage(usage, price, currency) {
  if (!usage) return '';
  const parts = [`${formatTokens(usage.total)} tokens`];
  if (usage.prompt || usage.completion) {
    const detail = [`输入 ${formatTokens(usage.prompt)}`, `输出 ${formatTokens(usage.completion)}`];
    if (usage.reasoning) detail.push(`思考 ${formatTokens(usage.reasoning)}`);
    if (usage.cacheHit) detail.push(`缓存命中 ${formatTokens(usage.cacheHit)}`);
    parts[0] += `（${detail.join(' · ')}）`;
  }
  const cost = estimateCost(usage, price);
  if (cost != null) parts.push(formatCost(cost, currency));
  return parts.join(' · ');
}
