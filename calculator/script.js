// Calculator state.
// `tokens` holds what's been committed so far, e.g. ['12', '+', '3', '*'].
// `current` is the number being typed. Evaluation respects × ÷ before + −.
const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const MAX_DIGITS = 15;

let tokens = [];
let current = '0';
let justEvaluated = false;
let lastRepeat = null; // ['+', '3'] so pressing = again repeats the last step

const resultEl = document.getElementById('result');
const expressionEl = document.getElementById('expression');
const clearEl = document.getElementById('clear');

function inputDigit(d) {
  if (justEvaluated) reset();
  const digits = current.replace(/[-.]/g, '');
  if (digits.length >= MAX_DIGITS) return;
  if (current === '0') current = d;
  else if (current === '-0') current = '-' + d;
  else current += d;
}

function inputDecimal() {
  if (justEvaluated) reset();
  if (current === '') current = '0';
  if (!current.includes('.')) current += '.';
}

function inputOperator(op) {
  justEvaluated = false;
  lastRepeat = null;
  if (current === '') {
    // Pressing a second operator just swaps the previous one.
    if (tokens.length) tokens[tokens.length - 1] = op;
    else tokens = ['0', op];
    return;
  }
  tokens.push(clean(current), op);
  current = '';
}

function equals() {
  let parts;
  if (justEvaluated && lastRepeat) {
    parts = [current, ...lastRepeat];
  } else {
    if (!tokens.length) return;
    if (current === '') tokens.pop(); // trailing operator, e.g. "5 +" then =
    else tokens.push(clean(current));
    parts = tokens;
    if (parts.length >= 3) lastRepeat = parts.slice(-2);
  }

  const value = evaluate(parts);
  expressionEl.textContent = describe(parts) + ' =';
  tokens = [];
  justEvaluated = true;

  if (!Number.isFinite(value)) {
    current = '0';
    lastRepeat = null;
    render('Can’t divide by 0');
    return;
  }
  current = String(round(value));
  render();
}

function percent() {
  if (current === '') current = tokens.length ? tokens[tokens.length - 2] : '0';
  current = String(round(parseFloat(current) / 100));
}

function toggleSign() {
  if (current === '') current = '0';
  current = current.startsWith('-') ? current.slice(1) : '-' + current;
}

function backspace() {
  if (justEvaluated) {
    expressionEl.textContent = '';
    justEvaluated = false;
    return;
  }
  if (current === '') return;
  current = current.slice(0, -1);
  if (current === '' || current === '-') current = '0';
}

function clear() {
  // First press clears the entry (C), second press clears everything (AC).
  if (current !== '0' && current !== '' && !justEvaluated) current = '0';
  else reset();
}

function reset() {
  tokens = [];
  current = '0';
  justEvaluated = false;
  lastRepeat = null;
  expressionEl.textContent = '';
}

// Two passes: × ÷ first, then + − left to right.
function evaluate(parts) {
  const stack = [parseFloat(parts[0])];
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i];
    const n = parseFloat(parts[i + 1]);
    if (op === '*') stack.push(stack.pop() * n);
    else if (op === '/') stack.push(stack.pop() / n);
    else stack.push(op === '-' ? -n : n);
  }
  return stack.reduce((a, b) => a + b, 0);
}

// Hides floating point noise like 0.1 + 0.2 = 0.30000000000000004.
function round(n) {
  return parseFloat(n.toPrecision(12));
}

function clean(s) {
  return s.endsWith('.') ? s.slice(0, -1) : s;
}

function format(s) {
  const n = parseFloat(s);
  if (Math.abs(n) >= 1e15 || (n !== 0 && Math.abs(n) < 1e-9)) {
    return n.toExponential(6).replace(/\.?0+e/, 'e');
  }
  const [int, dec] = s.split('.');
  const sign = int.startsWith('-') ? '−' : '';
  const grouped = int.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + grouped + (dec !== undefined ? '.' + dec : '');
}

function describe(parts) {
  return parts.map((p, i) => (i % 2 ? SYMBOL[p] : format(p))).join(' ');
}

function render(message) {
  const text = message || format(current === '' ? tokens[tokens.length - 2] : current);
  resultEl.textContent = text;
  resultEl.classList.toggle('error', Boolean(message));

  // Shrink the font as the number gets longer so it always fits.
  const len = text.length;
  resultEl.style.setProperty('--size', len > 16 ? '1.6rem' : len > 12 ? '2.2rem' : len > 9 ? '2.8rem' : '3.6rem');

  if (!justEvaluated) {
    expressionEl.textContent = tokens.length ? describe(tokens) : '';
  }

  const pendingOp = current === '' ? tokens[tokens.length - 1] : null;
  document.querySelectorAll('[data-op]').forEach(b => {
    b.classList.toggle('active', b.dataset.op === pendingOp);
  });

  clearEl.textContent = current !== '0' && current !== '' && !justEvaluated ? 'C' : 'AC';
}

function handle(key) {
  if (/^\d$/.test(key)) inputDigit(key);
  else if (key in SYMBOL) inputOperator(key);
  else if (key === 'decimal') inputDecimal();
  else if (key === 'equals') return equals();
  else if (key === 'percent') percent();
  else if (key === 'sign') toggleSign();
  else if (key === 'back') backspace();
  else if (key === 'clear') clear();
  render();
}

document.querySelector('.keys').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  handle(btn.dataset.digit || btn.dataset.op || btn.dataset.action);
});

const KEYMAP = {
  '.': 'decimal', ',': 'decimal', 'Enter': 'equals', '=': 'equals', '%': 'percent',
  'Backspace': 'back', 'Escape': 'clear', 'Delete': 'clear', 'x': '*', 'X': '*',
};

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = KEYMAP[e.key] || e.key;
  if (!/^\d$/.test(key) && !(key in SYMBOL) && !Object.values(KEYMAP).includes(key)) return;
  e.preventDefault();
  handle(key);
  flash(key);
});

// Light up the matching on-screen button when typing on the keyboard.
function flash(key) {
  const btn = document.querySelector(
    `[data-digit="${key}"], [data-op="${CSS.escape(key)}"], [data-action="${key}"]`
  );
  if (!btn) return;
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 120);
}

render();
