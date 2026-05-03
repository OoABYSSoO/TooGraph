export type StreamingJsonStateRoute = {
  text: string;
  completed: boolean;
};

export function routeStreamingJsonStateText(text: string, stateKeys: string[]) {
  const allowedKeys = new Set(stateKeys.filter(Boolean));
  const routes: Record<string, StreamingJsonStateRoute> = {};
  const source = text.trimStart();
  if (!source.startsWith("{")) {
    return routes;
  }

  let index = source.indexOf("{") + 1;
  while (index < source.length) {
    index = skipWhitespaceAndComma(source, index);
    const keyResult = readJsonString(source, index);
    if (!keyResult) {
      break;
    }
    index = skipWhitespace(source, keyResult.nextIndex);
    if (source[index] !== ":") {
      break;
    }
    index = skipWhitespace(source, index + 1);
    if (source[index] === '"') {
      const valueResult = readJsonString(source, index, true);
      if (!valueResult) {
        break;
      }
      if (allowedKeys.has(keyResult.value)) {
        routes[keyResult.value] = {
          text: valueResult.value,
          completed: valueResult.completed,
        };
      }
      index = valueResult.nextIndex;
      continue;
    }
    index = skipJsonValue(source, index);
  }

  return routes;
}

function skipWhitespaceAndComma(source: string, index: number) {
  let cursor = index;
  while (cursor < source.length && (/\s/.test(source[cursor]) || source[cursor] === ",")) {
    cursor += 1;
  }
  return cursor;
}

function skipWhitespace(source: string, index: number) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function readJsonString(source: string, index: number, allowPartial = false) {
  if (source[index] !== '"') {
    return null;
  }
  let cursor = index + 1;
  let value = "";
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '"') {
      return { value, nextIndex: cursor + 1, completed: true };
    }
    if (char === "\\") {
      const escaped = source[cursor + 1];
      if (escaped === undefined) {
        return allowPartial ? { value, nextIndex: source.length, completed: false } : null;
      }
      value += decodeJsonEscape(escaped);
      cursor += 2;
      continue;
    }
    value += char;
    cursor += 1;
  }
  return allowPartial ? { value, nextIndex: source.length, completed: false } : null;
}

function decodeJsonEscape(char: string) {
  if (char === "n") {
    return "\n";
  }
  if (char === "r") {
    return "\r";
  }
  if (char === "t") {
    return "\t";
  }
  if (char === '"') {
    return '"';
  }
  if (char === "\\") {
    return "\\";
  }
  if (char === "/") {
    return "/";
  }
  return char;
}

function skipJsonValue(source: string, index: number) {
  let cursor = index;
  let depth = 0;
  let inString = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (inString) {
      if (char === "\\") {
        cursor += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      cursor += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      if (depth === 0) {
        return cursor;
      }
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return cursor + 1;
    }
    cursor += 1;
  }
  return cursor;
}
