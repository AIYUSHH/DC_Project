/**
 * Pure, ordered firewall rule evaluation. Inputs are never mutated.
 *
 * Exports: validateRule, validatePacket, evaluatePacket, evaluatePackets
 */

const MAX_RULES = 100;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPort(value) {
  return Number.isInteger(value) && value >= 0 && value <= 65535;
}

function isAction(value) {
  return value === 'allow' || value === 'deny';
}

function invalidResult(errors) {
  return {
    errors,
    action: null,
    matchedRuleId: null,
    matchedRuleIndex: null,
    usedDefaultPolicy: false,
    trace: [],
  };
}

/**
 * Validate a rule without coercion. IDs are preserved exactly, not generated or
 * trimmed; uniqueness is checked separately across the complete rule list.
 * @returns {string[]} Validation errors, or an empty array for a valid rule.
 */
export function validateRule(rule) {
  if (!isRecord(rule)) return ['Rule must be an object.'];

  const errors = [];
  if (typeof rule.id !== 'string' || rule.id.trim().length === 0) {
    errors.push('Rule id must be a nonempty string.');
  }
  if (typeof rule.enabled !== 'boolean') {
    errors.push('Rule enabled must be a boolean.');
  }
  if (rule.protocol !== 'TCP' && rule.protocol !== 'UDP' && rule.protocol !== 'ANY') {
    errors.push('Rule protocol must be TCP, UDP, or ANY.');
  }
  if (rule.destinationPort !== null && !isPort(rule.destinationPort)) {
    errors.push('Rule destinationPort must be an integer from 0 to 65535 or null.');
  }
  if (!isAction(rule.action)) {
    errors.push('Rule action must be allow or deny.');
  }
  return errors;
}

/** @returns {string[]} Validation errors, or an empty array for a valid packet. */
export function validatePacket(packet) {
  if (!isRecord(packet)) return ['Packet must be an object.'];

  const errors = [];
  if (packet.protocol !== 'TCP' && packet.protocol !== 'UDP') {
    errors.push('Packet protocol must be TCP or UDP.');
  }
  if (!isPort(packet.destinationPort)) {
    errors.push('Packet destinationPort must be an integer from 0 to 65535.');
  }
  return errors;
}

/**
 * Validate every input before producing a verdict, including disabled rules and
 * rules after a potential match. Rule indices are zero-based.
 *
 * A trace entry is emitted for every rule on valid input. Skipped rules and
 * rules after the first match have null match fields because they were not
 * tested. All rules after the winner are marked not-evaluated, even if disabled.
 *
 * @returns {{errors: string[], action: ('allow'|'deny'|null),
 *   matchedRuleId: (string|null), matchedRuleIndex: (number|null),
 *   usedDefaultPolicy: boolean, trace: Object[]}}
 */
export function evaluatePacket(packet, rules, defaultAction = 'deny') {
  const errors = validatePacket(packet);
  if (!isAction(defaultAction)) {
    errors.push('Default action must be allow or deny.');
  }
  if (!Array.isArray(rules)) {
    errors.push('Rules must be an array.');
  } else if (rules.length > MAX_RULES) {
    errors.push(`Rules must contain at most ${MAX_RULES} entries.`);
  } else {
    const ids = new Set();
    // An indexed loop also validates holes in sparse arrays as missing rules.
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      for (const error of validateRule(rule)) {
        errors.push(`Rule at index ${index}: ${error}`);
      }
      if (isRecord(rule) && typeof rule.id === 'string' && rule.id.trim().length > 0) {
        if (ids.has(rule.id)) {
          errors.push(`Rule at index ${index}: Duplicate rule id ${JSON.stringify(rule.id)}.`);
        }
        ids.add(rule.id);
      }
    }
  }
  if (errors.length > 0) return invalidResult(errors);

  const result = {
    errors: [],
    action: defaultAction,
    matchedRuleId: null,
    matchedRuleIndex: null,
    usedDefaultPolicy: true,
    trace: [],
  };

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    const entry = {
      ruleId: rule.id,
      status: 'not-evaluated',
      protocolMatches: null,
      portMatches: null,
    };
    if (result.matchedRuleIndex === null) {
      if (!rule.enabled) {
        entry.status = 'skipped';
      } else {
        entry.protocolMatches = rule.protocol === 'ANY' || rule.protocol === packet.protocol;
        entry.portMatches = rule.destinationPort === null ||
          rule.destinationPort === packet.destinationPort;
        if (entry.protocolMatches && entry.portMatches) {
          entry.status = 'matched';
          result.action = rule.action;
          result.matchedRuleId = rule.id;
          result.matchedRuleIndex = index;
          result.usedDefaultPolicy = false;
        } else {
          entry.status = 'no-match';
        }
      }
    }
    result.trace.push(entry);
  }
  return result;
}

/**
 * Return one independent result per packet, preserving order (including sparse
 * array positions). There is no batch-size cap. A non-array batch returns one
 * error result rather than throwing or silently returning an empty batch.
 * @returns {ReturnType<typeof evaluatePacket>[]}
 */
export function evaluatePackets(packets, rules, defaultAction = 'deny') {
  if (!Array.isArray(packets)) {
    return [invalidResult(['Packets must be an array.'])];
  }
  return Array.from(packets, packet => evaluatePacket(packet, rules, defaultAction));
}
