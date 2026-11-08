/**
 * Step-by-step working panels for the algorithms used in the learning modules.
 * Trace generation reuses the production algorithms for the final result; the
 * intermediate rows are explanatory records and never replace the real result.
 */
import { bytesOf, bin8, hexs } from './encoding.js';
import { crc8, cksum } from './checksums.js';
import { encodeSecded, decodeSecded } from '../simulations/hamming-code.js';
import { encodeRS1511, decodeRS1511 } from '../simulations/reed-solomon.js';
import { cidrInfo, ip32, ip4, parseCidr } from './addressing.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bits = bytes => bytes.map(bin8).join('');
const pad = (n, width) => (n >>> 0).toString(2).padStart(width, '0');

export function traceCRC8(input) {
  const data = Array.isArray(input) ? input : bytesOf(String(input));
  if (!data.length) throw new Error('Enter at least one character.');
  if (data.length > 8) throw new Error('Use up to 8 UTF-8 bytes for this long-division view.');
  const polynomial = '100000111'; // x^8 + x^2 + x + 1
  let work = bits(data) + '0'.repeat(8);
  const steps = [];
  for (let i = 0; i < work.length - 8; i++) {
    if (work[i] !== '1') continue;
    const before = work;
    const part = work.slice(i, i + 9);
    const xor = Array.from(part, (v, j) => v === polynomial[j] ? '0' : '1').join('');
    work = work.slice(0, i) + xor + work.slice(i + 9);
    steps.push({ title: 'XOR at bit ' + (i + 1), detail: 'The leading bit is 1, so align the generator polynomial here.', before: before.slice(i, i + 9), operation: polynomial, result: xor, offset: i });
  }
  const remainder = work.slice(-8);
  const value = parseInt(remainder, 2);
  const expected = crc8(data);
  return { title: 'CRC-8 polynomial long division', result: 'CRC-8 = 0x' + expected.toString(16).padStart(2, '0').toUpperCase(), steps: [
    { title: 'Convert the message to bits', detail: 'UTF-8 bytes: ' + hexs(data) + '. Append eight zero bits because the generator has degree 8.', value: bits(data) + '00000000' },
    { title: 'Generator polynomial', detail: 'x⁸ + x² + x + 1 is represented by 100000111 (including the x⁸ term).', value: polynomial },
    ...steps.map(s => ({...s, value: s.before + '  XOR  ' + s.operation + '  =  ' + s.result})),
    { title: 'Read the remainder', detail: 'The final eight bits are the CRC remainder. This trace uses the same CRC-8 parameters as the simulator.', value: remainder + ' = 0x' + value.toString(16).padStart(2, '0').toUpperCase() },
    { title: 'Verify against the simulator', detail: 'The trace and the production crc8() function must agree.', value: '0x' + expected.toString(16).padStart(2, '0').toUpperCase(), status: value === expected ? 'pass' : 'fail' }
  ]};
}

export function traceInternetChecksum(input) {
  const data = Array.isArray(input) ? input : bytesOf(String(input));
  if (!data.length) throw new Error('Enter at least one character.');
  if (data.length > 24) throw new Error('Use up to 24 UTF-8 bytes for this walkthrough.');
  const words = [];
  for (let i = 0; i < data.length; i += 2) words.push(((data[i] << 8) | (data[i + 1] || 0)) >>> 0);
  let sum = 0;
  const steps = [{ title: 'Split into 16-bit words', detail: 'Network byte order is high byte first. An odd final byte is padded with 00.', value: words.map(x => '0x' + x.toString(16).padStart(4, '0').toUpperCase()).join('  +  ') }];
  words.forEach((word, i) => {
    const raw = sum + word;
    sum = raw;
    steps.push({ title: 'Add word ' + (i + 1), detail: 'Add this 16-bit word to the running total.', value: pad(raw, 17) + '  (0x' + raw.toString(16).toUpperCase() + ')' });
    while (sum > 0xffff) {
      const carry = sum >>> 16;
      sum = (sum & 0xffff) + carry;
      steps.push({ title: 'Wrap the carry around', detail: 'Add the overflow carry back into the least-significant 16 bits (one’s-complement addition).', value: 'low 16 bits ' + pad(sum - carry, 16) + ' + carry ' + carry + ' = ' + pad(sum, 16) });
    }
  });
  const checksum = (~sum) & 0xffff;
  const expected = cksum(data);
  steps.push({ title: 'Take the one’s complement', detail: 'Invert every bit of the folded 16-bit sum.', value: pad(sum, 16) + ' → ' + pad(checksum, 16) + ' (0x' + checksum.toString(16).padStart(4, '0').toUpperCase() + ')' });
  steps.push({ title: 'Verify against the simulator', detail: 'The walkthrough result is checked against the production cksum() function.', value: '0x' + expected.toString(16).padStart(4, '0').toUpperCase(), status: checksum === expected ? 'pass' : 'fail' });
  return { title: 'Internet checksum', result: 'Checksum = 0x' + expected.toString(16).padStart(4, '0').toUpperCase(), steps };
}

export function traceHamming(data, flipPosition = 0) {
  if (!/^[01]{4}$/.test(String(data))) throw new Error('Enter exactly four binary data bits.');
  const encoded = encodeSecded(String(data));
  const position = Number(flipPosition);
  const received = encoded.split('');
  if (position >= 1 && position <= 8) received[position - 1] = received[position - 1] === '1' ? '0' : '1';
  const receivedText = received.join('');
  const decoded = decodeSecded(receivedText);
  const coverage = [
    'P1 checks positions 1, 3, 5, 7',
    'P2 checks positions 2, 3, 6, 7',
    'P4 checks positions 4, 5, 6, 7',
    'P8 checks all eight bits (overall even parity)'
  ];
  return { title: 'Hamming SECDED parity and syndrome', result: decoded.status + ' · recovered data ' + decoded.data, steps: [
    { title: 'Place the data bits', detail: 'Hamming parity positions are powers of two: 1, 2 and 4. Data occupies 3, 5, 6 and 7.', value: 'Position:  1 2 3 4 5 6 7 8\nRole:      P P D P D D D P\nData:      ' + encoded.split('').join(' ') },
    { title: 'Calculate parity coverage', detail: 'Each parity bit checks positions whose binary position number contains its bit.', value: coverage.join('\n') },
    { title: 'Encode with even parity', detail: 'The first seven bits are Hamming(7,4); bit 8 makes the total parity even (SECDED).', value: encoded },
    { title: position ? 'Simulate a flipped bit at position ' + position : 'No corruption injected', detail: position ? 'Flip exactly one received bit, leaving the sender’s encoded word unchanged.' : 'The received codeword matches the transmitted codeword.', value: encoded + ' → ' + receivedText },
    { title: 'Calculate the syndrome', detail: 'The parity-check results form a binary position number. A non-zero syndrome points to a bit position.', value: 'Syndrome = ' + decoded.syndrome + ' (binary ' + pad(decoded.syndrome, 3) + '), overall parity = ' + decoded.overallParity },
    { title: 'Correct / classify', detail: 'SECDED corrects a single-bit error; a non-zero syndrome with even overall parity indicates a double-bit error and is not corrected.', value: decoded.status + '\nCorrected: ' + decoded.corrected + '\nRecovered data: ' + decoded.data }
  ]};
}

export function traceSubnet(cidr) {
  const parsed = parseCidr(String(cidr));
  if (!parsed) throw new Error('Enter a valid IPv4 CIDR, for example 192.168.1.10/24.');
  const info = cidrInfo(parsed.a, parsed.p);
  const addressBits = ip32(parsed.a), maskBits = ip32(info.m), networkBits = ip32(info.n);
  const groups = s => s.match(/.{8}/g).join(' . ');
  const andRows = Array.from({length: 32}, (_, i) => (addressBits[i] === '1' && maskBits[i] === '1') ? '1' : '0').join('');
  return { title: 'Subnetting: binary AND', result: 'Network = ' + ip4(info.n) + '/' + parsed.p, steps: [
    { title: 'Convert the IP address to 32 bits', detail: 'Each dotted-decimal octet becomes an 8-bit binary number.', value: ip4(parsed.a) + '\n' + groups(addressBits) },
    { title: 'Build the subnet mask', detail: 'A /' + parsed.p + ' prefix has ' + parsed.p + ' network bits (1s), followed by ' + (32 - parsed.p) + ' host bits (0s).', value: ip4(info.m) + '\n' + groups(maskBits) },
    { title: 'Apply bitwise AND', detail: 'A result bit is 1 only when both the address bit and mask bit are 1.', value: groups(addressBits) + '\nAND ' + groups(maskBits) + '\n=   ' + groups(andRows) },
    { title: 'Read the network address', detail: 'The AND result is the network portion; host bits are cleared to zero.', value: groups(networkBits) + '\n' + ip4(info.n) + '/' + parsed.p },
    { title: 'Calculate the remaining range', detail: 'Broadcast sets all host bits to 1. Usable-host rules differ for /31 and /32.', value: 'Broadcast: ' + ip4(info.b) + '\nFirst host: ' + ip4(info.first) + '\nLast host: ' + ip4(info.last) + '\nUsable hosts: ' + info.usable }
  ]};
}

export function traceReedSolomon(input, corruptPosition = 0) {
  const data = Array.isArray(input) ? input : String(input).split(',').map(x => Number(x.trim()));
  if (data.length !== 11 || data.some(x => !Number.isInteger(x) || x < 0 || x > 255)) throw new Error('Enter exactly 11 decimal bytes (0–255).');
  const encoded = encodeRS1511(data);
  const received = encoded.slice();
  const pos = Number(corruptPosition);
  if (pos >= 1 && pos <= 15) received[pos - 1] ^= 0x53;
  const decoded = decodeRS1511(received);
  return { title: 'Reed–Solomon RS(15,11) over GF(256)', result: decoded.status + ' · corrected symbols: ' + (decoded.positions.length || 0), steps: [
    { title: 'Start with 11 data symbols', detail: 'Each decimal value is one byte (a symbol in GF(256)). Four extra symbols will provide redundancy.', value: data.join(', ') },
    { title: 'Construct the generator polynomial', detail: 'This implementation uses GF(256) with primitive field polynomial 0x11D and four generator roots α⁰, α¹, α² and α³.', value: 'g(x) = (x − α⁰)(x − α¹)(x − α²)(x − α³)' },
    { title: 'Divide to produce parity symbols', detail: 'The encoder performs polynomial division in GF(256). Addition/subtraction is XOR; multiplication uses finite-field arithmetic, not ordinary integer arithmetic.', value: '11 data symbols + 4 parity symbols\nParity: ' + encoded.slice(11).join(', ') },
    { title: 'Transmit the codeword', detail: 'The code is systematic: the original 11 data bytes remain at the start, followed by 4 parity bytes.', value: encoded.join(', ') },
    { title: pos ? 'Simulate a damaged symbol' : 'Receive the codeword', detail: pos ? 'One symbol is XORed with 0x53 to simulate corruption at the selected one-based position.' : 'No corruption was injected for this walkthrough.', value: encoded.join(', ') + (pos ? '\n→ ' + received.join(', ') : '') },
    { title: 'Evaluate syndromes and correct', detail: 'The decoder evaluates four syndromes and searches for a valid one- or two-symbol correction. Four parity symbols can correct up to two unknown symbol errors.', value: 'Syndromes: ' + decoded.syndromes.join(', ') + '\n' + decoded.status + '\nRecovered data: ' + decoded.data.join(', ') }
  ]};
}

const examples = {
  crc: { title: 'CRC-8', input: 'HELLO', hint: 'Enter text (up to 8 UTF-8 bytes).' },
  checksum: { title: 'Internet checksum', input: 'HELLO', hint: 'Enter text (up to 24 UTF-8 bytes).' },
  hamming: { title: 'Hamming SECDED', input: '1011', hint: 'Four data bits; choose a bit position to flip (0 = no error).' },
  reed: { title: 'Reed–Solomon', input: '72,101,108,108,111,32,87,111,114,108,100', hint: 'Exactly 11 decimal byte values; choose a symbol position to corrupt (0 = none).' },
  subnet: { title: 'Subnetting', input: '192.168.1.10/24', hint: 'Enter an IPv4 address and prefix, e.g. 192.168.1.10/24.' }
};

export function mountAlgorithmWorking(root, options = {}) {
  const kinds = options.only ? [options.only] : ['crc', 'checksum', 'hamming', 'reed'];
  const markup = kinds.map(kind => {
    const item = examples[kind];
    const isBit = kind === 'hamming', isRs = kind === 'reed';
    return '<section class="panel aw-panel" data-aw-panel="' + kind + '">' +
      '<div class="aw-heading"><div><h3>Show the working: ' + item.title + '</h3><p class="hint">' + item.hint + '</p></div><button class="btn ghost sm" type="button" data-aw-run="' + kind + '">Show the working</button></div>' +
      '<div class="controls"><div class="field grow"><label>Input</label><input data-aw-input="' + kind + '" value="' + esc(item.input) + '" spellcheck="false"></div>' +
      (isBit ? '<div class="field"><label>Flip bit (1–8)</label><input data-aw-position="' + kind + '" type="number" min="0" max="8" value="3"></div>' : '') +
      (isRs ? '<div class="field"><label>Damage symbol (1–15)</label><input data-aw-position="' + kind + '" type="number" min="0" max="15" value="5"></div>' : '') +
      '</div><div class="aw-output" data-aw-output="' + kind + '" aria-live="polite"><p class="hint">Run the walkthrough to see every calculation stage.</p></div></section>';
  }).join('');
  root.insertAdjacentHTML('beforeend', markup);
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-aw-run]');
    if (!button || !root.contains(button)) return;
    const kind = button.dataset.awRun;
    const panel = button.closest('[data-aw-panel]');
    const input = panel.querySelector('[data-aw-input]').value;
    const position = panel.querySelector('[data-aw-position]')?.value || 0;
    const output = panel.querySelector('[data-aw-output]');
    try {
      const trace = kind === 'crc' ? traceCRC8(input)
        : kind === 'checksum' ? traceInternetChecksum(input)
        : kind === 'hamming' ? traceHamming(input, position)
        : traceReedSolomon(input, position);
      output.innerHTML = '<div class="aw-result"><strong>' + esc(trace.result) + '</strong></div><ol class="aw-steps">' +
        trace.steps.map((step, i) => '<li><span class="aw-step-number">' + (i + 1) + '</span><div><strong>' + esc(step.title) + '</strong><p>' + esc(step.detail || '') + '</p>' + (step.value ? '<pre>' + esc(step.value) + '</pre>' : '') + '</div></li>').join('') + '</ol>';
    } catch (error) {
      output.innerHTML = '<p class="aw-error" role="alert">' + esc(error.message) + '</p>';
    }
  });
}

export function mountSubnetWorking(root) {
  const item = examples.subnet;
  root.insertAdjacentHTML('beforeend', '<section class="panel aw-panel" data-aw-panel="subnet"><div class="aw-heading"><div><h3>Show the working: binary subnet calculation</h3><p class="hint">' + item.hint + '</p></div><button class="btn ghost sm" type="button" data-aw-run="subnet">Show the working</button></div><div class="field"><label>IPv4 CIDR</label><input data-aw-input="subnet" value="' + item.input + '" spellcheck="false"></div><div class="aw-output" data-aw-output="subnet" aria-live="polite"><p class="hint">See the address AND mask operation in binary.</p></div></section>');
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-aw-run="subnet"]');
    if (!button || !root.contains(button)) return;
    const output = root.querySelector('[data-aw-output="subnet"]');
    try {
      const trace = traceSubnet(root.querySelector('[data-aw-input="subnet"]').value);
      output.innerHTML = '<div class="aw-result"><strong>' + esc(trace.result) + '</strong></div><ol class="aw-steps">' + trace.steps.map((step, i) => '<li><span class="aw-step-number">' + (i + 1) + '</span><div><strong>' + esc(step.title) + '</strong><p>' + esc(step.detail) + '</p><pre>' + esc(step.value) + '</pre></div></li>').join('') + '</ol>';
    } catch (error) {
      output.innerHTML = '<p class="aw-error" role="alert">' + esc(error.message) + '</p>';
    }
  });
}
