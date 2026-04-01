export function escape_html(value: string): string {
  let needs_escape = false;
  let i = 0;

  while (i < value.length) {
    const code = value.charCodeAt(i++);
    if (
      code === 34 ||
      code === 38 ||
      code === 39 ||
      code === 60 ||
      code === 62
    ) {
      needs_escape = true;
      break;
    }
  }

  if (!needs_escape) return value;

  let result = "";
  let start = 0;
  i = 0;

  while (i < value.length) {
    const code = value.charCodeAt(i);
    let replacement = "";

    if (code === 34) replacement = "&quot;";
    else if (code === 38) replacement = "&amp;";
    else if (code === 39) replacement = "&#39;";
    else if (code === 60) replacement = "&lt;";
    else if (code === 62) replacement = "&gt;";

    if (replacement) {
      if (start < i) result += value.slice(start, i);
      result += replacement;
      start = i + 1;
    }

    i++;
  }

  if (start < value.length) result += value.slice(start);
  return result;
}
