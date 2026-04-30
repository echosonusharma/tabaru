import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { 
  tabGroupRulesStore, 
  buildEmptyRuleDraft, 
  DOMAIN_RULE_EXAMPLES,
  describeUrlPattern,
  extractDomainFromPattern,
  getUrlPatternValidationError,
  normalizeTabGroupRule,
  normalizeTabGroupRules,
  normalizeUrlPattern,
  TAB_GROUP_COLORS,
  TAB_GROUP_COLOR_HEX
} from './core';
import { TabGroupColor, TabGroupRule } from '../../types';
import { broadcastMsgToServiceWorker } from "../../utils";


// Re-export background logic for convenience if needed by other files
export * from './core';

export const TabGroupsIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 3v14M2 8h6M16 3v14M16 8h6" />
    <path d="M2 21h20" />
  </svg>
);

export function TabGroupsSection() {
  const [rules, setRules] = useState<TabGroupRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('new');
  const [draft, setDraft] = useState<TabGroupRule>(buildEmptyRuleDraft());
  const [patternError, setPatternError] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [groupingRuleId, setGroupingRuleId] = useState<string | null>(null);

  useEffect(() => {
    tabGroupRulesStore.get().then((storedRules) => {
      const normalizedRules = normalizeTabGroupRules(storedRules);
      setRules(normalizedRules);
      if (normalizedRules.length > 0) {
        setSelectedRuleId(normalizedRules[0].id);
        setDraft(normalizeTabGroupRule(normalizedRules[0]));
      }
    });
  }, []);

  const persist = async (newRules: TabGroupRule[]) => {
    const normalizedRules = normalizeTabGroupRules(newRules);
    setRules(normalizedRules);
    await tabGroupRulesStore.set(normalizedRules);
  };

  const selectRule = (rule: TabGroupRule) => {
    setSelectedRuleId(rule.id);
    setDraft(normalizeTabGroupRule(rule));
    setPatternError('');
  };

  const startCreate = () => {
    setSelectedRuleId('new');
    setDraft(buildEmptyRuleDraft());
    setPatternError('');
  };

  const updateDraft = (nextDraft: TabGroupRule) => {
    setDraft(nextDraft);
    if (patternError) {
      setPatternError('');
    }
  };

  const handleSubmit = async () => {
    const trimmedPattern = draft.pattern.trim();
    if (!trimmedPattern) {
      setPatternError('Pattern is required.');
      return;
    }

    const validationError = getUrlPatternValidationError(trimmedPattern);
    if (validationError) {
      setPatternError(validationError);
      return;
    }

    const normalizedPattern = normalizeUrlPattern(trimmedPattern);
    const duplicateRule = rules.find((rule) => rule.id !== draft.id && rule.pattern === normalizedPattern);
    if (duplicateRule) {
      setPatternError('That domain rule already exists.');
      return;
    }

    setPatternError('');
    const now = Date.now();

    if (selectedRuleId !== 'new' && draft.id) {
      const nextRules = rules.map((rule) =>
        rule.id === draft.id
          ? normalizeTabGroupRule({
            ...rule,
            pattern: normalizedPattern,
            title: draft.title?.trim() || undefined,
            color: draft.color,
            collapsed: !!draft.collapsed,
            enabled: draft.enabled !== false,
            updatedAt: now,
          })
          : rule
      );

      await persist(nextRules);
      const updatedRule = nextRules.find((rule) => rule.id === draft.id);
      if (updatedRule) {
        selectRule(updatedRule);
      }
    } else {
      const createdRule = normalizeTabGroupRule({
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        pattern: normalizedPattern,
        title: draft.title?.trim() || undefined,
        color: draft.color,
        collapsed: !!draft.collapsed,
        enabled: draft.enabled !== false,
        createdAt: now,
        updatedAt: now,
      });

      await persist([...rules, createdRule]);
      selectRule(createdRule);
    }
  };

  const deleteRule = async (id: string) => {
    const nextRules = rules.filter((rule) => rule.id !== id);
    await persist(nextRules);

    if (draft.id === id || selectedRuleId === id) {
      if (nextRules.length > 0) {
        selectRule(nextRules[0]);
      } else {
        startCreate();
      }
    }
  };

  const toggleRuleEnabled = async (rule: TabGroupRule) => {
    const nextRules = rules.map((item) =>
      item.id === rule.id
        ? normalizeTabGroupRule({
          ...item,
          enabled: item.enabled === false,
          updatedAt: Date.now(),
        })
        : item
    );

    await persist(nextRules);
    const updatedRule = nextRules.find((item) => item.id === rule.id);
    if (updatedRule && draft.id === updatedRule.id) {
      selectRule(updatedRule);
    }
  };

  const handleGroupNow = async (ruleId: string) => {
    setGroupingRuleId(ruleId);
    try {
      await broadcastMsgToServiceWorker({ action: 'groupTabsByRule', data: { ruleId } });
    } finally {
      setGroupingRuleId(null);
    }
  };

  const effectiveAutoTitle = extractDomainFromPattern(draft.pattern || 'https://tabs.example/*');
  const isEditing = selectedRuleId !== 'new' && !!draft.id;

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">Tab Groups</h1>
        <p class="settings-section-subtitle">Create domain rules that automatically move matching tabs into a shared group.</p>
      </div>

      <div class="tg-stack">
        <section class="settings-group tg-rule-browser">
          <div class="tg-browser-header">
            <div>
              <div class="tg-browser-title">Domain Rules</div>
              <div class="settings-row-hint">Tabs are matched against rules from top to bottom.</div>
            </div>
            <div class="tg-header-actions">
              <button class="tg-help-button" onClick={() => setShowGuide((value) => !value)} title="Show URL guide">?</button>
              <button class="btn" onClick={startCreate}>New rule</button>
            </div>
          </div>

          {rules.length === 0 && (
            <div class="tg-empty-state">
              <div class="tg-empty-title">No rules yet</div>
              <div class="settings-row-hint">Create a domain rule to start grouping matching tabs automatically.</div>
            </div>
          )}

          {rules.length > 0 && (
            <div class="tg-rule-list">
              {rules.map((rule) => (
                <div key={rule.id} class={selectedRuleId === rule.id ? 'tg-rule-card active' : 'tg-rule-card'}>
                  <div class="tg-rule-card-head">
                    <div class="tg-rule-card-titleblock">
                      <button class="tg-edit-link" onClick={() => selectRule(rule)}>
                        <code class="tg-pattern">{rule.pattern}</code>
                      </button>
                      <div class="tg-rule-meta">
                        {rule.color
                          ? <span class="tg-color-swatch" style={`background:${TAB_GROUP_COLOR_HEX[rule.color]}`} title={rule.color} />
                          : <span class="tg-badge tg-badge-auto">auto color</span>
                        }
                        <span class="tg-badge">{rule.title || extractDomainFromPattern(rule.pattern)}</span>
                        {rule.collapsed ? <span class="tg-badge">collapsed</span> : null}
                      </div>
                    </div>
                    <span class={rule.enabled === false ? 'tg-status tg-status-off' : 'tg-status'}>{rule.enabled === false ? 'disabled' : 'enabled'}</span>
                  </div>
                  <div class="tg-rule-actions">
                    <button class="btn tg-small-btn" onClick={() => selectRule(rule)}>Edit</button>
                    <button class="btn tg-small-btn" onClick={() => toggleRuleEnabled(rule)}>
                      {rule.enabled === false ? 'Enable' : 'Disable'}
                    </button>
                    <button class="btn tg-small-btn primary" disabled={groupingRuleId === rule.id || rule.enabled === false} onClick={() => handleGroupNow(rule.id)}>
                      {groupingRuleId === rule.id ? 'Grouping...' : 'Group now'}
                    </button>
                    <button class="btn tg-small-btn tg-btn-delete" onClick={() => deleteRule(rule.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showGuide ? (
            <div class="tg-guide">
              <div class="tg-guide-title">Domain rule guide</div>
              {DOMAIN_RULE_EXAMPLES.map((example) => (
                <div key={example.pattern} class="tg-guide-item">
                  <code>{example.pattern}</code>
                  <p>{example.description}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section class="settings-group tg-config-panel">
          <div class="tg-config-header">
            <div>
              <div class="tg-browser-title">{isEditing ? 'Rule configuration' : 'Create a rule'}</div>
              <div class="settings-row-hint">Auto title uses the root domain. Auto color picks a random Chrome tab-group color when a group is created.</div>
            </div>
            {isEditing ? (
              <button class="btn tg-btn-delete" onClick={() => deleteRule(draft.id)}>Delete rule</button>
            ) : null}
          </div>

          <div class="tg-form-field">
            <label class="tg-label">Domain rule</label>
            <input
              class={`tg-input${patternError ? ' tg-input-error' : ''}`}
              type="text"
              value={draft.pattern}
              placeholder="https://*.example.com/*"
              onInput={(e) => updateDraft({ ...draft, pattern: (e.target as HTMLInputElement).value })}
            />
            {patternError ? <span class="tg-error-msg">{patternError}</span> : <span class="settings-row-hint">{describeUrlPattern(draft.pattern)}</span>}
          </div>

          <div class="tg-form-row-inline">
            <div class="tg-form-field tg-field-grow">
              <label class="tg-label">Group title <span class="tg-optional">(optional)</span></label>
              <input
                class="tg-input"
                type="text"
                value={draft.title || ''}
                placeholder={`Auto (${effectiveAutoTitle})`}
                onInput={(e) => updateDraft({ ...draft, title: (e.target as HTMLInputElement).value })}
              />
            </div>

            <div class="tg-form-field">
              <label class="tg-label">Color <span class="tg-optional">(optional)</span></label>
              <div class="tg-color-picker">
                <button
                  class={`tg-color-opt${!draft.color ? ' selected' : ''}`}
                  style="background:#444"
                  title="Auto (random)"
                  onClick={() => updateDraft({ ...draft, color: undefined })}
                />
                {TAB_GROUP_COLORS.map((groupColor) => (
                  <button
                    key={groupColor}
                    class={`tg-color-opt${draft.color === groupColor ? ' selected' : ''}`}
                    style={`background:${TAB_GROUP_COLOR_HEX[groupColor]}`}
                    title={groupColor}
                    onClick={() => updateDraft({ ...draft, color: groupColor as TabGroupColor })}
                  />
                ))}
              </div>
            </div>
          </div>

          <div class="settings-group tg-inline-settings">
            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-label">Rule enabled</span>
                <span class="settings-row-hint">Disabled rules stay saved but stop moving tabs.</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={draft.enabled !== false}
                  onChange={(e) => updateDraft({ ...draft, enabled: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-label">Collapse group after grouping</span>
                <span class="settings-row-hint">Applies when the extension creates or refreshes the managed group.</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={!!draft.collapsed}
                  onChange={(e) => updateDraft({ ...draft, collapsed: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="tg-preview-grid">
            <div class="tg-preview-card">
              <span class="tg-preview-label">Resolved title</span>
              <strong>{draft.title?.trim() || effectiveAutoTitle}</strong>
            </div>
            <div class="tg-preview-card">
              <span class="tg-preview-label">Resolved pattern</span>
              <code>{draft.pattern.trim() ? normalizeUrlPattern(draft.pattern) : 'https://*.example.com/*'}</code>
            </div>
          </div>

          <div class="settings-footer-actions">
            {isEditing ? <button class="btn" style={{ marginRight: '1rem' }} onClick={startCreate}>Create another</button> : null}
            <button class="btn primary" onClick={handleSubmit}>
              {isEditing ? 'Save changes' : 'Add rule'}
            </button>
          </div>
        </section>
      </div>
    </Fragment>
  );
}
