import React, { useEffect, useState } from 'react';
export default function TasksPage({ request }) {
  const [tasks, setTasks] = useState([]), [title, setTitle] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load() { try { const d = await request('/api/tasks'); setTasks(d.tasks || []); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  async function create(e) { e.preventDefault(); setBusy(true); setError(''); try { await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) }); setTitle(''); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function setStatus(task, status) { try { await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); } catch (err) { setError(err.message); } }
  return <section className="panel"><div className="moduleTitle"><div><h3>Staff tasks</h3><p>Authenticated follow-up tasks (list, create, update).</p></div><span className="badge">{tasks.length} tasks</span></div>
  {error && <p className="error" role="alert">{error}</p>}
  <form onSubmit={create} className="buttonRow"><label>New task title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label><button className="primary" disabled={busy || !title.trim()}>Create task</button></form>
  {tasks.length ? <div className="tableWrap"><table><thead><tr><th>Task</th><th>Status (labelled)</th><th>Priority</th><th>Update</th></tr></thead><tbody>{tasks.map((t) => <tr key={t.id}><td>{t.title}<br /><small>{t.description ?? ''}</small></td><td>{t.status}</td><td>{t.priority}</td><td>{t.status !== 'DONE' && <button type="button" className="secondary" onClick={() => setStatus(t, 'DONE')}>Mark DONE</button>} {t.status !== 'OPEN' && <button type="button" className="secondary" onClick={() => setStatus(t, 'OPEN')}>Reopen</button>}</td></tr>)}</tbody></table></div> : <p className="muted">No tasks yet (empty list preserved).</p>}</section>;
}
