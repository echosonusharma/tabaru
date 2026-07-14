type Tok =
  | { t: 'n'; v: number }
  | { t: 'op'; v: string }
  | { t: 'id'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'eof' };

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      toks.push({ t: 'n', v: parseFloat(s.slice(i, j)) });
      i = j;
    } else if (c >= 'a' && c <= 'z') {
      let j = i;
      while (j < s.length && s[j] >= 'a' && s[j] <= 'z') j++;
      toks.push({ t: 'id', v: s.slice(i, j) });
      i = j;
    } else if (s.slice(i, i + 2) === '**') {
      toks.push({ t: 'op', v: '**' }); i += 2;
    } else if ('+-*/%'.includes(c)) {
      toks.push({ t: 'op', v: c }); i++;
    } else if (c === '^') {
      toks.push({ t: 'op', v: '**' }); i++;
    } else if (c === '(') {
      toks.push({ t: 'lp' }); i++;
    } else if (c === ')') {
      toks.push({ t: 'rp' }); i++;
    } else if (c === ',') {
      i++; // skip thousand-separator commas
    } else {
      throw new Error(`Unexpected: ${c}`);
    }
  }
  toks.push({ t: 'eof' });
  return toks;
}

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt,
  abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log, log2: Math.log2, log10: Math.log10,
  exp: Math.exp,
};

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

function parse(toks: Tok[]): number {
  let pos = 0;
  const peek = (): Tok => toks[pos];
  const eat = (): Tok => toks[pos++];

  function expr(): number { return addSub(); }

  function addSub(): number {
    let v = mulDiv();
    let p: Tok;
    while ((p = peek()).t === 'op' && (p.v === '+' || p.v === '-')) {
      eat();
      const r = mulDiv();
      v = p.v === '+' ? v + r : v - r;
    }
    return v;
  }

  function mulDiv(): number {
    let v = power();
    let p: Tok;
    while ((p = peek()).t === 'op' && (p.v === '*' || p.v === '/' || p.v === '%')) {
      eat();
      const r = power();
      v = p.v === '*' ? v * r : p.v === '/' ? v / r : v % r;
    }
    return v;
  }

  function power(): number {
    const base = unary();
    const p = peek();
    if (p.t === 'op' && p.v === '**') {
      eat();
      return Math.pow(base, power()); // right-associative
    }
    return base;
  }

  function unary(): number {
    const p = peek();
    if (p.t === 'op' && p.v === '-') { eat(); return -power(); }
    if (p.t === 'op' && p.v === '+') { eat(); return power(); }
    return primary();
  }

  function primary(): number {
    const tok = peek();
    if (tok.t === 'n') { eat(); return tok.v; }
    if (tok.t === 'id') {
      eat();
      if (tok.v in CONSTS) return CONSTS[tok.v];
      if (tok.v in FUNCS) {
        if (peek().t !== 'lp') throw new Error();
        eat();
        const arg = expr();
        if (peek().t !== 'rp') throw new Error();
        eat();
        return FUNCS[tok.v](arg);
      }
      throw new Error(`Unknown identifier: ${tok.v}`);
    }
    if (tok.t === 'lp') {
      eat();
      const v = expr();
      if (peek().t !== 'rp') throw new Error();
      eat();
      return v;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(tok)}`);
  }

  const result = expr();
  if (peek().t !== 'eof') throw new Error('Unconsumed tokens');
  return result;
}

function formatResult(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  // Trim float noise while keeping meaningful decimals
  const s = parseFloat(n.toPrecision(10)).toString();
  return s;
}

export function getMathResult(query: string): { display: string; result: number; expr: string } | null {
  const q = query.trim();
  if (!q || q.startsWith('!')) return null;

  // Reject ISO dates (YYYY-MM-DD) — hyphens would evaluate as subtraction
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(q)) return null;

  // Must contain an operator or known function — avoids treating plain words/URLs as math
  const hasOperator = /[+\-*/%^]/.test(q);
  const hasFunction = /\b(sqrt|cbrt|abs|floor|ceil|round|sin|cos|tan|asin|acos|atan|log|log2|log10|exp)\s*\(/.test(q.toLowerCase());
  if (!hasOperator && !hasFunction) return null;

  // Strip trailing operator so incomplete expressions (e.g. "22*44-") still evaluate
  const cleaned = q.replace(/[+\-*/%^]\s*$/, '').trim();
  if (!cleaned) return null;

  // Pre-strip thousand-separator commas (e.g. "1,000" → "1000")
  const normalized = cleaned.replace(/(\d),(\d)/g, '$1$2');

  try {
    const toks = tokenize(normalized.toLowerCase());
    const result = parse(toks);
    if (!isFinite(result) || isNaN(result)) return null;
    return { result, display: formatResult(result), expr: cleaned };
  } catch {
    return null;
  }
}
