function parse_url_path(url: string): string {
  const len = url.length;
  let path_start = 0;
  let path_end = len;
  let i = 0;

  for (; i < len - 2; i++) {
    if (url.charCodeAt(i + 1) === 47 && url.charCodeAt(i + 2) === 47) {
      i += 3;

      for (; i < len; i++)
        if (url.charCodeAt(i) === 47) {
          path_start = i;
          break;
        }

      break;
    }
  }

  for (i = path_start; i < len; i++)
    if (url.charCodeAt(i) === 63) {
      path_end = i;
      break;
    }

  return url.substring(path_start, path_end);
}

export { parse_url_path };
