import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../services/api';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';

const CHANNEL_TABS = [
  { id: 'email', label: '📧 Email Letter' },
  { id: 'sms', label: '💬 SMS Message' },
  { id: 'whatsapp', label: '🟢 WhatsApp Message' },
];

/**
 * Notification Settings — SIMPLE editor.
 * Step 1 pick channel, Step 2 click buttons to insert details, Step 3 save.
 * Live preview + send-a-test-to-me button included.
 */
export default function NotificationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notify, setNotify] = useState(null);
  const [tab, setTab] = useState('sms');
  const [variables, setVariables] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [form, setForm] = useState({});
  const [testTo, setTestTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/settings/notifications');
      setVariables(data.data.variables || []);
      setPreviewData(data.data.preview || {});
      const s = data.data.settings || {};
      setForm({
        email: { subject: s.email?.subject || '', htmlBody: s.email?.htmlBody || '', enabled: s.email?.enabled !== false },
        sms: { textBody: s.sms?.textBody || '', dltTemplateId: s.sms?.dltTemplateId || '', dltSenderId: s.sms?.dltSenderId || '', enabled: s.sms?.enabled !== false },
        whatsapp: { textBody: s.whatsapp?.textBody || '', templateName: s.whatsapp?.templateName || '', templateLanguage: s.whatsapp?.templateLanguage || 'en_US', bodyParams: (s.whatsapp?.bodyParams || []).join(', '), enabled: s.whatsapp?.enabled !== false },
      });
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const set = (channel, key, value) => {
    setForm((prev) => ({ ...prev, [channel]: { ...prev[channel], [key]: value } }));
  };

  /** Click a variable button -> insert {{key}} where the cursor is. */
  const insertVar = (key) => {
    const fieldId = tab === 'email' ? 'emailBody' : tab === 'sms' ? 'smsBody' : 'waBody';
    const field = tab === 'email' ? 'htmlBody' : 'textBody';
    const el = document.getElementById(fieldId);
    const token = `{{${key}}}`;
    if (!el) {
      set(tab, field, `${form[tab]?.[field] || ''}${token}`);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const value = el.value || '';
    set(tab, field, `${value.slice(0, start)}${token}${value.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      try { el.setSelectionRange(start + token.length, start + token.length); } catch { /* ignore */ }
    });
  };


  const renderPreview = () => {
    const f = form[tab] || {};
    const p = previewData || {};
    const fill = (text) => String(text || '').replace(/{{\s*([\w.]+)\s*}}/g, (m, k) => (p[k] ?? m));
    if (tab === 'email') return { subject: fill(f.subject), html: fill(f.htmlBody) };
    if (tab === 'sms') {
      const text = fill(f.textBody);
      return { text, length: text.length };
    }
    const keys = String(f.bodyParams || '').split(',').map((k) => k.trim()).filter(Boolean);
    return { templateName: f.templateName, language: f.templateLanguage, params: keys.map((k) => p[k] ?? '') };
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const f = form[tab] || {};
      const payload = { ...f };
      if (tab === 'whatsapp') {
        payload.bodyParams = String(f.bodyParams || '').split(',').map((k) => k.trim()).filter(Boolean);
      }
      const { data } = await api.put(`/api/settings/notifications/${tab}`, payload);
      setNotify({ message: data.message || 'Saved!', type: 'success' });
      await load();
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
    } finally {
      setSaving(false);
    }
  };

  const doTest = async (useHelloWorld = false) => {
    if (!testTo.trim()) {
      setNotify({ message: 'First type your own mobile number or email above.', type: 'error' });
      return;
    }
    setTesting(true);
    try {
      const f = form[tab] || {};
      const payload = { channel: tab, to: testTo.trim(), useHelloWorld };
      if (tab === 'sms') payload.textBody = f.textBody;
      if (tab === 'whatsapp' && !useHelloWorld) {
        payload.templateName = f.templateName;
        payload.templateLanguage = f.templateLanguage;
        payload.bodyParams = String(f.bodyParams || '').split(',').map((k) => k.trim()).filter(Boolean);
      }
      const { data } = await api.post('/api/settings/notifications/test', payload);
      setNotify({ message: `${data.message} — check your phone now.`, type: 'success', duration: 8000 });
    } catch (err) {
      setNotify({ message: getErrorMessage(err), type: 'error', duration: 8000 });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="page"><Spinner label="Loading message settings…" /></div>;
  }
  const f = form[tab] || {};
  const preview = renderPreview();
  return (
    <div className="page">
      {notify ? <Toast {...notify} onClose={() => setNotify(null)} /> : null}
      <div className="page-head">
        <div>
          <h1 className="page-title">Message Settings</h1>
          <p className="page-subtitle">Step 1: Pick a channel. Step 2: Click buttons to add details. Step 3: Press Save.</p>
        </div>
      </div>
      <div className="tab-row">
        {CHANNEL_TABS.map((c) => (
          <button key={c.id} type="button" className={`tab-btn ${tab === c.id ? 'active' : ''}`} onClick={() => setTab(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="register-grid">
        <div className="card">
          <h3 className="card-title">Step 1 — Write your message</h3>
          <label className="form-check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={f.enabled !== false} onChange={(e) => set(tab, 'enabled', e.target.checked)} />
            {' '}Use this channel when notifying officers
          </label>
          {tab === 'email' ? (
            <>
              <label className="login-label" htmlFor="emailSubject">Subject line</label>
              <input id="emailSubject" className="input" value={f.subject || ''} onChange={(e) => set(tab, 'subject', e.target.value)} />
              <label className="login-label" htmlFor="emailBody" style={{ marginTop: 10 }}>Letter body</label>
              <textarea id="emailBody" className="input" rows={10} value={f.htmlBody || ''} onChange={(e) => set(tab, 'htmlBody', e.target.value)} />
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(tab, 'htmlBody', `${f.htmlBody || ''}\n<table border="1" cellpadding="6"><tr><td><b>Booth Number</b></td><td>{{boothNumber}}</td></tr>\n<tr><td><b>Booth Name</b></td><td>{{boothName}}</td></tr>\n<tr><td><b>Mandal</b></td><td>{{mandal}}</td></tr>\n</table>`)}>+ Add details table</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(tab, 'htmlBody', `${f.htmlBody || ''}\n<p><a href="{{cardUrl}}">Download ID Card</a></p>`)}>+ Add ID-card link</button>
              </div>
            </>
          ) : null}
          {tab === 'sms' ? (
            <>
              <p className="muted">Keep it short — now {preview.length || 0} letters.</p>
              <label className="login-label" htmlFor="smsBody">SMS text</label>
              <textarea id="smsBody" className="input" rows={7} value={f.textBody || ''} onChange={(e) => set(tab, 'textBody', e.target.value)} />
              <label className="login-label" htmlFor="dltId" style={{ marginTop: 10 }}>DLT Template ID (ask SMS company)</label>
              <input id="dltId" className="input" value={f.dltTemplateId || ''} onChange={(e) => set(tab, 'dltTemplateId', e.target.value)} />
              <label className="login-label" htmlFor="dltSender" style={{ marginTop: 10 }}>Sender Name (e.g. ELCION)</label>
              <input id="dltSender" className="input" value={f.dltSenderId || ''} onChange={(e) => set(tab, 'dltSenderId', e.target.value)} />
            </>
          ) : null}


          {tab === 'whatsapp' ? (
            <>
              <p className="muted">Template Name must match the Meta-approved name exactly.</p>
              <label className="login-label" htmlFor="waName">Approved Template Name</label>
              <input id="waName" className="input" value={f.templateName || ''} onChange={(e) => set(tab, 'templateName', e.target.value)} placeholder="polling_duty_allocation" />
              <label className="login-label" htmlFor="waLang" style={{ marginTop: 10 }}>Language code</label>
              <input id="waLang" className="input" value={f.templateLanguage || ''} onChange={(e) => set(tab, 'templateLanguage', e.target.value)} placeholder="en_US" />
              <label className="login-label" htmlFor="waParams" style={{ marginTop: 10 }}>Details in order (comma separated)</label>
              <input id="waParams" className="input" value={f.bodyParams || ''} onChange={(e) => set(tab, 'bodyParams', e.target.value)} />
            </>
          ) : null}
          <h4 style={{ marginTop: 14 }}>Step 2 — Click to add officer details</h4>
          <div className="btn-row" style={{ flexWrap: 'wrap' }}>
            {variables.map((v) => (
              <button key={v.key} type="button" className="btn btn-ghost btn-sm" title={`Example: ${v.example}`} onClick={() => insertVar(v.key)}>
                + {v.label}
              </button>
            ))}
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={doSave}>
              {saving ? 'Saving…' : 'Step 3 — Save Message'}
            </button>
          </div>
        </div>
        <div>
          <div className="card">
            <h3 className="card-title">Live preview — what the officer sees</h3>
            <div className="phone-preview">
              {tab === 'email' ? (
                <>
                  <strong>{preview.subject}</strong>
                  <div dangerouslySetInnerHTML={{ __html: preview.html }} />
                </>
              ) : tab === 'sms' ? (
                <pre className="msg-content">{preview.text}</pre>
              ) : (
                <>
                  <div className="muted">Template: <span className="mono">{preview.templateName} ({preview.language})</span></div>
                  <ol>{preview.params.map((p, i) => <li key={i}>{p}</li>)}</ol>
                </>
              )}
            </div>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <h3 className="card-title">Try it on your own phone first</h3>
            <p className="muted">Type YOUR number below. Only you get this test.</p>
            <input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={tab === 'email' ? 'you@example.com' : 'Your mobile: 98765 43210'} />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={testing} onClick={() => doTest(false)}>
                {testing ? 'Sending…' : 'Send Test to Me'}
              </button>
              {tab === 'whatsapp' ? (
                <button type="button" className="btn btn-ghost btn-sm" disabled={testing} onClick={() => doTest(true)}>
                  Test hello_world
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

