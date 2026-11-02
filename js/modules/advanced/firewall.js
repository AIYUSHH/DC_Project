/** Stateless, browser-only firewall lab. Working policies intentionally reset on navigation. */
import { regMod } from '../registry.js';
import { esc } from '../../core/utils.js';
import { tbl } from '../../core/ui-helpers.js';
import { evaluatePackets, validatePacket, validateRule } from '../../simulations/firewall.js';

const examplePackets = [
  { protocol: 'TCP', destinationPort: 443 },
  { protocol: 'TCP', destinationPort: 22 },
  { protocol: 'UDP', destinationPort: 53 },
  { protocol: 'TCP', destinationPort: 80 },
  { protocol: 'UDP', destinationPort: 443 },
];
const actionLabel = action => action === 'allow' ? 'Allow' : 'Deny';
const portLabel = port => port === null ? 'Any' : String(port);
const packetLabel = packet => `${packet.protocol} → destination port ${packet.destinationPort}`;
const badge = action => `<span class="fw-badge fw-${action}">${actionLabel(action)}</span>`;
const ruleLabel = rule => `${rule.id}: ${rule.protocol} / ${portLabel(rule.destinationPort)} / ${actionLabel(rule.action)}`;
// Blank or non-decimal fields remain invalid rather than becoming port zero via Number('').
const readPort = value => /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;

regMod({
  id: 'firewall',
  group: 'adv',
  title: 'Firewall and Access Control Lab',
  desc: 'Create packet-filtering rules, test simulated traffic, and discover how rule order changes allow or deny decisions.',
  obj: [
    'Match simulated packets by protocol and destination port.',
    'Explain first-match evaluation and default allow or deny policies.',
    'Identify the matching rule and follow the evaluation trace.',
    'Compare the same packets before and after reordering overlapping rules.',
  ],
  mount(root) {
    let rules = [], nextId = 1, editingId = null, revision = 0;
    let latest = null, baseline = null, selectedPacket = 0;
    root.innerHTML = `
      <div class="firewall-lab">
        <div class="verdict info" role="note"><b>Simulation only</b> This stateless model does not send traffic, change your firewall, or track connections. Allow means permitted by this policy, not guaranteed delivery. Rules reset when you leave or reload this lab.</div>
        <section class="panel">
          <h3>1. Build an ordered policy</h3>
          <p class="hint">Rules run top to bottom. All conditions must match; the first enabled match wins. Otherwise the default policy applies.</p>
          <div class="btnrow fw-presets"><button type="button" class="btn ghost" data-fw-preset="basic">Basic rules / Reset</button><button type="button" class="btn ghost" data-fw-preset="order">Order matters preset</button></div>
          <p class="hint" id="fw-preset-hint"></p>
          <form id="fw-rule-form" novalidate>
            <h4 id="fw-editor-title">Add a rule</h4>
            <div class="controls">
              <div class="field"><label for="fw-rule-protocol">Protocol</label><select id="fw-rule-protocol" name="protocol"><option>TCP</option><option>UDP</option><option value="ANY">Any (TCP or UDP)</option></select></div>
              <div class="field"><label for="fw-port-mode">Port matching</label><select id="fw-port-mode" name="portMode"><option value="exact">Exact destination port</option><option value="any">Any destination port</option></select></div>
              <div class="field"><label for="fw-rule-port">Destination port</label><input id="fw-rule-port" name="port" type="number" min="0" max="65535" step="1" value="443" required></div>
              <div class="field"><label for="fw-rule-action">Action</label><select id="fw-rule-action" name="action"><option value="allow">Allow</option><option value="deny">Deny</option></select></div>
            </div>
            <p class="hint">Ports: 0–65535. Port 0 is reserved but can be modeled. Match service destination ports, not the client's ephemeral source port.</p>
            <div class="btnrow"><button type="submit" class="btn" id="fw-save-rule">Add rule</button><button type="button" class="btn ghost" id="fw-cancel-edit" hidden>Cancel edit</button></div>
            <div id="fw-rule-errors" class="fw-errors" role="alert" hidden></div>
          </form>
          <div id="fw-rules"></div>
          <div class="fw-policy"><label for="fw-default">Default policy when no rule matches</label><select id="fw-default"><option value="deny">Deny</option><option value="allow">Allow</option></select></div>
          <p class="hint">Use ↑ / ↓ to reorder rules. Disabling a rule skips it without deleting it. Maximum 100 rules.</p>
          <p id="fw-policy-status" class="hint" role="status"></p>
        </section>
        <section class="panel">
          <h3>2. Submit simulated packets</h3>
          <form id="fw-packet-form" novalidate>
            <div class="controls">
              <div class="field"><label for="fw-packet-protocol">Packet protocol</label><select id="fw-packet-protocol" name="protocol"><option>TCP</option><option>UDP</option></select></div>
              <div class="field"><label for="fw-packet-port">Destination port</label><input id="fw-packet-port" name="port" type="number" min="0" max="65535" step="1" value="443" required></div>
            </div>
            <div class="btnrow"><button type="submit" class="btn">Test packet</button><button type="button" class="btn ghost" id="fw-examples">Run 5 example packets</button></div>
            <div id="fw-packet-errors" class="fw-errors" role="alert" hidden></div>
          </form>
        </section>
        <section class="panel">
          <h3>3. Inspect results and compare policies</h3>
          <p class="hint">After a test, save a baseline, change or reorder rules, then compare. Comparison reruns exactly the baseline packets against the current policy.</p>
          <div class="btnrow"><button type="button" class="btn ghost" id="fw-baseline" disabled>Save results as baseline</button><button type="button" class="btn ghost" id="fw-compare" disabled>Compare baseline packets</button></div>
          <p id="fw-baseline-status" class="hint" role="status">No baseline saved.</p>
          <p id="fw-result-status" class="hint" role="status">Submit a packet or run the examples to start.</p>
          <div id="fw-results"></div>
          <div id="fw-trace"></div>
          <div id="fw-comparison"></div>
        </section>
      </div>`;

    const $ = selector => root.querySelector(selector);
    const ruleForm = $('#fw-rule-form'), packetForm = $('#fw-packet-form');
    const defaultAction = () => $('#fw-default').value;
    const showErrors = (id, errors) => {
      const box = $(id);
      box.hidden = !errors.length;
      box.textContent = errors.join(' ');
    };
    const resetEditor = () => {
      editingId = null;
      ruleForm.reset();
      $('#fw-rule-port').disabled = false;
      $('#fw-editor-title').textContent = 'Add a rule';
      $('#fw-save-rule').textContent = 'Add rule';
      $('#fw-cancel-edit').hidden = true;
      showErrors('#fw-rule-errors', []);
    };

    function renderRules() {
      $('#fw-rules').innerHTML = rules.length ? tbl(
        ['Order / ID', 'Enabled', 'Protocol', 'Destination port', 'Action', 'Controls'],
        rules.map((rule, index) => [
          `${index + 1} / ${rule.id}`,
          { h: `<input type="checkbox" data-fw-toggle="${rule.id}" aria-label="Enable rule ${rule.id}" ${rule.enabled ? 'checked' : ''}>` },
          rule.protocol === 'ANY' ? 'Any' : rule.protocol,
          portLabel(rule.destinationPort),
          { h: badge(rule.action) },
          { h: `<div class="fw-rule-buttons">${[
            ['up', '↑', index === 0, 'Move up'],
            ['down', '↓', index === rules.length - 1, 'Move down'],
            ['edit', 'Edit', false, 'Edit'],
            ['delete', 'Delete', false, 'Delete'],
          ].map(([action, label, disabled, description]) => `<button type="button" class="btn ghost sm" data-fw-action="${action}" data-fw-id="${rule.id}" aria-label="${description} rule ${rule.id}" ${disabled ? 'disabled' : ''}>${label}</button>`).join('')}</div>` },
        ])
      ) : '<p class="hint">No rules. Every valid packet will use the default policy.</p>';
    }

    function policyChanged(message) {
      revision += 1;
      renderRules();
      $('#fw-policy-status').textContent = message;
      $('#fw-comparison').innerHTML = '';
      if (latest) {
        $('#fw-result-status').textContent = 'Policy changed. Results below are historical; test again or compare baseline packets to update.';
        $('#fw-baseline').disabled = true;
      }
    }

    function loadPreset(kind) {
      const definitions = kind === 'order'
        ? [['TCP', null, 'deny'], ['TCP', 443, 'allow']]
        : [['TCP', 443, 'allow'], ['TCP', 22, 'deny'], ['UDP', 53, 'allow']];
      // Never reuse IDs within a mounted lab, including after changing presets.
      rules = definitions.map(([protocol, destinationPort, action]) => ({ id: `R${nextId++}`, enabled: true, protocol, destinationPort, action }));
      $('#fw-default').value = 'deny';
      resetEditor();
      $('#fw-preset-hint').textContent = kind === 'order'
        ? 'Try TCP → 443: the broad TCP deny wins. Save a baseline, move the HTTPS allow above it, then compare.'
        : 'HTTPS (TCP 443) and DNS (UDP 53) are allowed; SSH (TCP 22) is denied. These rules do not overlap, so reordering them will not change verdicts.';
      policyChanged('Preset loaded. Default policy: Deny.');
    }

    const matchSource = result => result.usedDefaultPolicy
      ? 'Default policy'
      : `${result.matchedRuleId} at position ${result.matchedRuleIndex + 1}`;

    function renderTrace() {
      if (!latest) return;
      const result = latest.results[selectedPacket], packet = latest.packets[selectedPacket];
      const check = value => value === null ? '—' : value ? 'Match' : 'Mismatch';
      const explanation = result.usedDefaultPolicy
        ? `No enabled rule matched. The saved policy's default action (${actionLabel(latest.defaultAction)}) applied.`
        : `Rule ${result.matchedRuleId} at position ${result.matchedRuleIndex + 1} was the first enabled rule whose protocol and destination port conditions both matched. Its ${actionLabel(result.action)} action applied; later rules were not evaluated.`;
      const statuses = { skipped: 'Disabled — skipped', 'no-match': 'No match — continue', matched: `${actionLabel(result.action)} — stop`, 'not-evaluated': 'Not evaluated — earlier rule matched' };
      $('#fw-trace').innerHTML = `<h4>Evaluation trace: ${esc(packetLabel(packet))}</h4><p>${esc(explanation)}</p>` +
        (result.trace.length ? tbl(['Rule in tested policy', 'Protocol', 'Destination port', 'Evaluation'], result.trace.map((entry, index) => [
          `${index + 1}. ${ruleLabel(latest.rules[index])}`, check(entry.protocolMatches), check(entry.portMatches), statuses[entry.status],
        ])) : '<p class="hint">The tested policy had no rules; the default policy applied immediately.</p>');
    }

    function run(packets) {
      const results = evaluatePackets(packets, rules, defaultAction());
      const errors = results.flatMap(result => result.errors);
      showErrors('#fw-packet-errors', errors);
      if (errors.length) return false;
      latest = {
        packets: packets.map(packet => ({ ...packet })),
        rules: rules.map(rule => ({ ...rule })),
        defaultAction: defaultAction(), results, revision,
      };
      selectedPacket = 0;
      $('#fw-result-status').textContent = `Tested ${packets.length} simulated packet${packets.length === 1 ? '' : 's'} against the current policy. Select a trace to see why.`;
      $('#fw-baseline').disabled = false;
      $('#fw-comparison').innerHTML = '';
      $('#fw-results').innerHTML = tbl(['Packet', 'Verdict', 'Matched rule / fallback', 'Details'], results.map((result, index) => [
        packetLabel(packets[index]), { h: badge(result.action) }, matchSource(result),
        { h: `<button type="button" class="btn ghost sm" data-fw-trace="${index}" aria-label="Show evaluation trace for packet ${index + 1}">Show trace</button>` },
      ]));
      renderTrace();
      return true;
    }

    ruleForm.addEventListener('submit', event => {
      event.preventDefault();
      const rule = {
        id: editingId || `R${nextId}`,
        enabled: editingId ? rules.find(item => item.id === editingId).enabled : true,
        protocol: ruleForm.elements.protocol.value,
        destinationPort: ruleForm.elements.portMode.value === 'any' ? null : readPort(ruleForm.elements.port.value),
        action: ruleForm.elements.action.value,
      };
      const errors = validateRule(rule);
      if (!editingId && rules.length >= 100) errors.push('Maximum 100 rules. Delete a rule before adding another.');
      showErrors('#fw-rule-errors', errors);
      if (errors.length) return;
      if (editingId) rules = rules.map(item => item.id === editingId ? rule : item);
      else { rules.push(rule); nextId += 1; }
      resetEditor();
      policyChanged(`Rule ${rule.id} saved.`);
    });
    $('#fw-port-mode').addEventListener('change', () => {
      $('#fw-rule-port').disabled = ruleForm.elements.portMode.value === 'any';
    });
    $('#fw-cancel-edit').addEventListener('click', () => {
      resetEditor();
      ruleForm.elements.protocol.focus();
    });
    $('#fw-default').addEventListener('change', () => policyChanged(`Default policy changed to ${actionLabel(defaultAction())}.`));
    $('#fw-rules').addEventListener('change', event => {
      const id = event.target.dataset.fwToggle;
      const rule = rules.find(item => item.id === id);
      if (!rule) return;
      rule.enabled = event.target.checked;
      policyChanged(`Rule ${id} ${rule.enabled ? 'enabled' : 'disabled'}.`);
      root.querySelector(`[data-fw-toggle="${id}"]`)?.focus();
    });
    $('#fw-rules').addEventListener('click', event => {
      const button = event.target.closest('[data-fw-action]');
      if (!button) return;
      const index = rules.findIndex(rule => rule.id === button.dataset.fwId);
      if (index < 0) return;
      const rule = rules[index], action = button.dataset.fwAction;
      if (action === 'edit') {
        editingId = rule.id;
        ruleForm.elements.protocol.value = rule.protocol;
        ruleForm.elements.portMode.value = rule.destinationPort === null ? 'any' : 'exact';
        ruleForm.elements.port.value = rule.destinationPort === null ? '' : String(rule.destinationPort);
        ruleForm.elements.port.disabled = rule.destinationPort === null;
        ruleForm.elements.action.value = rule.action;
        $('#fw-editor-title').textContent = `Edit rule ${rule.id}`;
        $('#fw-save-rule').textContent = 'Save changes';
        $('#fw-cancel-edit').hidden = false;
        showErrors('#fw-rule-errors', []);
        ruleForm.elements.protocol.focus();
        return;
      }
      if (action === 'delete') {
        rules.splice(index, 1);
        if (editingId === rule.id) resetEditor();
      } else {
        const target = index + (action === 'up' ? -1 : 1);
        if (target < 0 || target >= rules.length) return;
        [rules[index], rules[target]] = [rules[target], rules[index]];
      }
      policyChanged(action === 'delete' ? `Rule ${rule.id} deleted.` : `Rule ${rule.id} moved to position ${rules.indexOf(rule) + 1}.`);
      // Preserve keyboard position after replacing table rows, even at an ordering boundary.
      const focusId = action === 'delete' ? rules[Math.min(index, rules.length - 1)]?.id : rule.id;
      const candidates = focusId ? root.querySelectorAll(`[data-fw-id="${focusId}"]`) : [];
      const preferred = Array.from(candidates).find(item => item.dataset.fwAction === action && !item.disabled);
      (preferred || Array.from(candidates).find(item => !item.disabled) || $('#fw-save-rule')).focus();
    });
    root.querySelectorAll('[data-fw-preset]').forEach(button => button.addEventListener('click', () => loadPreset(button.dataset.fwPreset)));
    packetForm.addEventListener('submit', event => {
      event.preventDefault();
      const packet = { protocol: packetForm.elements.protocol.value, destinationPort: readPort(packetForm.elements.port.value) };
      const errors = validatePacket(packet);
      showErrors('#fw-packet-errors', errors);
      if (!errors.length) run([packet]);
    });
    $('#fw-examples').addEventListener('click', () => run(examplePackets));
    $('#fw-results').addEventListener('click', event => {
      const button = event.target.closest('[data-fw-trace]');
      if (!button) return;
      selectedPacket = Number(button.dataset.fwTrace);
      renderTrace();
    });
    $('#fw-baseline').addEventListener('click', () => {
      if (!latest || latest.revision !== revision) return;
      // run() creates detached snapshots; subsequent edits cannot alter this baseline.
      baseline = latest;
      $('#fw-compare').disabled = false;
      $('#fw-comparison').innerHTML = '';
      $('#fw-baseline-status').textContent = `Baseline saved: ${baseline.packets.length} packet(s), ${baseline.rules.length} rules, default ${actionLabel(baseline.defaultAction)}. Change the policy, then compare.`;
    });
    $('#fw-compare').addEventListener('click', () => {
      if (!baseline || !run(baseline.packets)) return;
      const changed = latest.results.filter((result, index) => result.action !== baseline.results[index].action).length;
      $('#fw-result-status').textContent = `Comparison complete: ${changed} of ${baseline.packets.length} packet verdicts changed. Current-policy traces are shown above.`;
      const summary = snapshot => snapshot.rules.length
        ? snapshot.rules.map((rule, index) => `${index + 1}. ${ruleLabel(rule)}${rule.enabled ? '' : ' (disabled)'}`).join('\n')
        : 'No rules';
      $('#fw-comparison').innerHTML = `<h4>Baseline vs current policy</h4>` + tbl(
        ['Packet', 'Baseline verdict / match', 'Current verdict / match', 'Change'],
        latest.results.map((result, index) => {
          const before = baseline.results[index];
          return [packetLabel(baseline.packets[index]),
            { h: `${badge(before.action)} ${esc(matchSource(before))}` },
            { h: `${badge(result.action)} ${esc(matchSource(result))}` },
            before.action !== result.action ? 'Verdict changed' : before.matchedRuleId !== result.matchedRuleId ? 'Same verdict; different match' : 'Same verdict',
          ];
        })
      ) + `<details class="fw-snapshots"><summary>Inspect the two policy snapshots</summary><div class="fw-snapshot-grid"><div><h4>Baseline (default ${actionLabel(baseline.defaultAction)})</h4><pre>${esc(summary(baseline))}</pre></div><div><h4>Current (default ${actionLabel(latest.defaultAction)})</h4><pre>${esc(summary(latest))}</pre></div></div></details>`;
    });
    loadPreset('basic');
  },
});
