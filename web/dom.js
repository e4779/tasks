// tiny DOM builder — children are strings (text nodes) or nodes, never parsed HTML
export const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined) n.append(c);
  return n;
};
