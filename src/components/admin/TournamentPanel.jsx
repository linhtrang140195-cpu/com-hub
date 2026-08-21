import { useEffect, useState, useRef } from 'react';
import { api } from '../../services/api';
import { formatDateShort } from '../../utils/datetime';

export default function TournamentPanel({ campaign, campaignId }) {
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [addingMatch, setAddingMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({ round_name: '', match_date: '', team_a_id: '', team_b_id: '' });
  const [editingResult, setEditingResult] = useState(null);
  const fileRef = useRef();

  // Website URL management
  const [websiteUrl, setWebsiteUrl] = useState(campaign?.website || '');
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlMsg, setUrlMsg] = useState('');

  // Live data from tournament website
  const [liveData, setLiveData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');

  // Post suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  // Sync posts from website
  const [syncPostsLoading, setSyncPostsLoading] = useState(false);
  const [syncPostsMsg, setSyncPostsMsg] = useState('');

  const load = async () => {
    const [t, m] = await Promise.all([
      api.get(`/tournaments/${campaignId}/teams`),
      api.get(`/tournaments/${campaignId}/matches`),
    ]);
    setTeams(t);
    setMatches(m);
  };

  useEffect(() => { load(); }, [campaignId]);
  useEffect(() => { setWebsiteUrl(campaign?.website || ''); }, [campaign?.website]);

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportMsg('');
    try {
      const csv = await file.text();
      const result = await api.post(`/tournaments/${campaignId}/teams/import`, { csv, replace: true });
      setImportMsg(`✓ Đã import ${result.imported} đội`);
      load();
    } catch (err) {
      setImportMsg(`⚠️ ${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleAddMatch = async () => {
    if (!newMatch.team_a_id || !newMatch.team_b_id) return;
    await api.post(`/tournaments/${campaignId}/matches`, {
      ...newMatch,
      match_date: newMatch.match_date ? `${newMatch.match_date}T00:00:00+07:00` : null,
    });
    setNewMatch({ round_name: '', match_date: '', team_a_id: '', team_b_id: '' });
    setAddingMatch(false);
    load();
  };

  const handleSaveResult = async (matchId, scoreA, scoreB) => {
    const status = (scoreA !== '' && scoreB !== '') ? 'done' : 'scheduled';
    await api.patch(`/tournaments/${campaignId}/matches/${matchId}`, {
      score_a: scoreA !== '' ? parseInt(scoreA) : null,
      score_b: scoreB !== '' ? parseInt(scoreB) : null,
      status,
    });
    setEditingResult(null);
    load();
  };

  const handleDeleteMatch = async (id) => {
    await api.delete(`/tournaments/${campaignId}/matches/${id}`);
    load();
  };

  const handleSaveUrl = async () => {
    setSavingUrl(true);
    setUrlMsg('');
    try {
      await api.patch(`/campaigns/${campaignId}`, { website: websiteUrl.trim() });
      setUrlMsg('✓ Đã lưu');
      setTimeout(() => setUrlMsg(''), 2000);
    } catch (e) {
      setUrlMsg(`⚠️ ${e.message}`);
    } finally {
      setSavingUrl(false);
    }
  };

  const handleSyncLive = async () => {
    setLiveLoading(true);
    setLiveError('');
    setLiveData(null);
    try {
      const data = await api.get(`/tournaments/${campaignId}/live-schedule`);
      setLiveData(data);
    } catch (e) {
      setLiveError(e.message);
    } finally {
      setLiveLoading(false);
    }
  };

  const handleSyncPosts = async () => {
    setSyncPostsLoading(true);
    setSyncPostsMsg('');
    try {
      const data = await api.post(`/tournaments/${campaignId}/sync-posts`, {});
      setSyncPostsMsg(`✓ Cập nhật ${data.synced}/${data.total} bài theo lịch trận`);
      setTimeout(() => setSyncPostsMsg(''), 4000);
    } catch (e) {
      setSyncPostsMsg(`⚠️ ${e.message}`);
    } finally {
      setSyncPostsLoading(false);
    }
  };

  const handleSuggestPosts = async () => {
    setSuggestLoading(true);
    setSuggestError('');
    setSuggestions([]);
    try {
      const data = await api.post(`/tournaments/${campaignId}/suggest-posts`, {});
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setSuggestError(e.message);
    } finally {
      setSuggestLoading(false);
    }
  };

  const urlSet = !!(campaign?.website || websiteUrl.trim());

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <div className="text-xs font-bold text-slate-400 tracking-wide mb-4">🏆 DỮ LIỆU GIẢI ĐẤU</div>

      {/* Website URL section */}
      <div className="mb-5 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-[11px] font-bold text-slate-500 mb-2">URL WEBSITE GIẢI ĐẤU</div>
        <div className="flex gap-2 items-center">
          <input
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            placeholder="https://dcvp.run.ingarena.net"
            className="flex-1 border border-slate-200 rounded-md px-3 py-1.5 text-xs outline-none focus:border-slate-400 bg-white"
          />
          <button
            onClick={handleSaveUrl}
            disabled={savingUrl}
            className="text-xs bg-[#1A1A2E] text-white font-bold rounded-md px-3 py-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {savingUrl ? 'Đang lưu...' : 'Lưu'}
          </button>
          {urlMsg && <span className="text-xs text-green-600 whitespace-nowrap">{urlMsg}</span>}
        </div>
        <div className="text-[10px] text-slate-400 mt-1.5">
          Sau khi lưu URL, dùng "Đồng bộ từ web" để xem lịch trận + kết quả realtime và "Gợi ý bài" để AI gợi ý content.
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSyncLive}
            disabled={!urlSet || liveLoading}
            className="text-xs bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-3 py-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {liveLoading ? '⏳ Đang tải...' : '🔄 Đồng bộ từ web'}
          </button>
          <button
            onClick={handleSyncPosts}
            disabled={!urlSet || syncPostsLoading}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md px-3 py-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {syncPostsLoading ? '⏳ Đang cập nhật...' : '📝 Cập nhật bài theo lịch'}
          </button>
          <button
            onClick={handleSuggestPosts}
            disabled={!urlSet || suggestLoading}
            className="text-xs bg-[#E94560] hover:bg-[#d03050] text-white font-bold rounded-md px-3 py-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {suggestLoading ? '⏳ Đang gợi ý...' : '💡 Gợi ý bài tiếp theo'}
          </button>
        </div>
        {syncPostsMsg && <div className="text-xs text-indigo-700 mt-2 font-medium">{syncPostsMsg}</div>}
        {liveError && <div className="text-xs text-red-500 mt-2">⚠️ {liveError}</div>}
        {suggestError && <div className="text-xs text-red-500 mt-2">⚠️ {suggestError}</div>}
      </div>

      {/* Post suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-5">
          <div className="text-[11px] font-bold text-slate-500 mb-2">💡 GỢI Ý BÀI TIẾP THEO</div>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 rounded px-1.5 py-0.5 shrink-0">{s.post_type}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-slate-800">{s.title}</div>
                    <div className="text-[11px] text-amber-700 mt-0.5">⏰ {s.timing}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 italic">{s.caption_hint}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live schedule from website */}
      {liveData && (
        <div className="mb-5">
          <div className="text-[11px] font-bold text-slate-500 mb-2">
            📡 LỊCH TRẬN REALTIME — <a href={liveData.website} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline font-normal">{liveData.website}</a>
          </div>

          {/* Group by date/time slot */}
          {(() => {
            const bySlot = {};
            for (const m of liveData.matches) {
              (bySlot[m.thoi_gian] ||= []).push(m);
            }
            return Object.entries(bySlot).map(([slot, ms]) => (
              <div key={slot} className="mb-3">
                <div className="text-[10px] font-bold text-slate-400 mb-1.5 flex items-center gap-2">
                  <span>{slot}</span>
                  <span className="text-slate-300">·</span>
                  <span>{ms[0]?.vong}</span>
                </div>
                <div className="space-y-1">
                  {ms.map((m, i) => {
                    const isDone = !!m.ti_so;
                    return (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isDone ? 'bg-slate-50' : 'bg-blue-50 border border-blue-100'}`}>
                        <span className="text-[10px] text-slate-400 w-[50px] shrink-0">[{m.bang}]</span>
                        <span className={`font-semibold flex-1 text-right ${isDone && m.ti_so.split('-')[0] > m.ti_so.split('-')[1] ? 'text-green-700' : ''}`}>{m.doi_a}</span>
                        <span className={`font-bold px-2 py-0.5 rounded text-center min-w-[40px] ${isDone ? 'bg-slate-200 text-slate-700' : 'bg-blue-200 text-blue-700'}`}>
                          {isDone ? m.ti_so : 'VS'}
                        </span>
                        <span className={`font-semibold flex-1 ${isDone && m.ti_so.split('-')[1] > m.ti_so.split('-')[0] ? 'text-green-700' : ''}`}>{m.doi_b}</span>
                        {m.trang_thai && <span className="text-[10px] text-purple-600 shrink-0">{m.trang_thai}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {/* Standings */}
          {liveData.standings?.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-bold text-slate-500 mb-2">BXH HIỆN TẠI</div>
              {(() => {
                const byBang = {};
                for (const s of liveData.standings) (byBang[s.bang] ||= []).push(s);
                return Object.entries(byBang).map(([bang, rows]) => (
                  <div key={bang} className="mb-3">
                    <div className="text-[10px] font-bold text-slate-400 mb-1">Bảng {bang}</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-slate-400">
                          <th className="text-left pb-1 w-6">#</th>
                          <th className="text-left pb-1">Đội</th>
                          <th className="text-center pb-1 w-8">Tr</th>
                          <th className="text-center pb-1 w-8">T</th>
                          <th className="text-center pb-1 w-8">H</th>
                          <th className="text-center pb-1 w-8">B</th>
                          <th className="text-center pb-1 w-12">Điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.sort((a, b) => (a.hang || 0) - (b.hang || 0)).map((r, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="py-1 text-slate-400">{r.hang}</td>
                            <td className="py-1 font-medium">{r.doi}</td>
                            <td className="py-1 text-center text-slate-500">{r.tran}</td>
                            <td className="py-1 text-center text-green-600">{r.thang}</td>
                            <td className="py-1 text-center text-amber-500">{r.hoa}</td>
                            <td className="py-1 text-center text-red-400">{r.thua}</td>
                            <td className="py-1 text-center font-bold">{r.diem}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Manual teams + matches section */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold text-slate-400">NHẬP THỦ CÔNG</div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="text-xs bg-slate-100 hover:bg-slate-200 rounded-md px-3 py-1.5 font-semibold cursor-pointer disabled:opacity-50"
          >
            {importing ? 'Đang import...' : '📥 Import CSV đội'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
        </div>
        {importMsg && <div className="text-xs text-green-700 mb-3">{importMsg}</div>}

        {teams.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-bold text-slate-400 mb-2">ĐỘI THAM GIA ({teams.length})</div>
            <div className="flex flex-wrap gap-2">
              {teams.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                  {t.logo_url && (
                    <img src={t.logo_url} alt="" className="w-5 h-5 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                  )}
                  <span className="text-xs font-medium">{t.name}</span>
                  {t.group_name && <span className="text-[10px] text-slate-400">({t.group_name})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-slate-400">LỊCH TRẬN THỦ CÔNG ({matches.length})</div>
            {teams.length > 0 && (
              <button
                onClick={() => setAddingMatch(v => !v)}
                className="text-xs text-[#E94560] font-bold cursor-pointer"
              >
                + Thêm trận
              </button>
            )}
          </div>

          {addingMatch && (
            <div className="bg-slate-50 rounded-lg p-3 mb-3 flex flex-wrap gap-2 items-end">
              <div>
                <div className="text-[10px] text-slate-400 mb-1">Vòng / Ngày</div>
                <input
                  value={newMatch.round_name}
                  onChange={e => setNewMatch(m => ({ ...m, round_name: e.target.value }))}
                  placeholder="VD: Vòng bảng A"
                  className="border border-slate-200 rounded px-2 py-1 text-xs w-[130px] outline-none"
                />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">Ngày thi đấu</div>
                <input type="date" value={newMatch.match_date}
                  onChange={e => setNewMatch(m => ({ ...m, match_date: e.target.value }))}
                  className="border border-slate-200 rounded px-2 py-1 text-xs outline-none" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">Đội A</div>
                <select value={newMatch.team_a_id} onChange={e => setNewMatch(m => ({ ...m, team_a_id: e.target.value }))}
                  className="border border-slate-200 rounded px-2 py-1 text-xs outline-none">
                  <option value="">-- Chọn --</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <span className="text-slate-400 text-sm pb-1">vs</span>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">Đội B</div>
                <select value={newMatch.team_b_id} onChange={e => setNewMatch(m => ({ ...m, team_b_id: e.target.value }))}
                  className="border border-slate-200 rounded px-2 py-1 text-xs outline-none">
                  <option value="">-- Chọn --</option>
                  {teams.filter(t => t.id !== newMatch.team_a_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button onClick={handleAddMatch} className="bg-[#1A1A2E] text-white text-xs font-bold rounded px-3 py-1.5 cursor-pointer">
                Lưu
              </button>
              <button onClick={() => setAddingMatch(false)} className="text-xs text-slate-400 cursor-pointer px-1">
                Huỷ
              </button>
            </div>
          )}

          {matches.length === 0 && !addingMatch && (
            <div className="text-xs text-slate-400 py-2">
              {teams.length === 0 ? 'Import CSV đội trước, sau đó thêm lịch trận thủ công.' : 'Chưa có trận nào — nhấn + Thêm trận.'}
            </div>
          )}

          {matches.map(m => (
            <MatchRow
              key={m.id}
              match={m}
              editing={editingResult === m.id}
              onEdit={() => setEditingResult(m.id)}
              onSave={(a, b) => handleSaveResult(m.id, a, b)}
              onCancel={() => setEditingResult(null)}
              onDelete={() => handleDeleteMatch(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchRow({ match, editing, onEdit, onSave, onCancel, onDelete }) {
  const [sa, setSa] = useState(match.score_a ?? '');
  const [sb, setSb] = useState(match.score_b ?? '');
  const isDone = match.status === 'done';

  return (
    <div className="flex items-center gap-2 py-2 border-t border-slate-50 first:border-t-0 text-xs">
      <div className="text-slate-400 w-[60px] shrink-0">{match.match_date ? formatDateShort(match.match_date) : '—'}</div>
      <div className="text-slate-500 w-[90px] shrink-0 truncate">{match.round_name || '—'}</div>
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        {match.team_a_logo && <img src={match.team_a_logo} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" onError={e => { e.target.style.display='none'; }} />}
        <span className="font-medium truncate">{match.team_a_name || '?'}</span>
        {editing ? (
          <>
            <input value={sa} onChange={e => setSa(e.target.value)} className="w-8 border border-slate-200 rounded px-1 py-0.5 text-center outline-none" placeholder="0" />
            <span className="text-slate-400">-</span>
            <input value={sb} onChange={e => setSb(e.target.value)} className="w-8 border border-slate-200 rounded px-1 py-0.5 text-center outline-none" placeholder="0" />
          </>
        ) : (
          <span className={`px-1.5 py-0.5 rounded font-bold ${isDone ? 'bg-slate-100 text-slate-600' : 'text-slate-300'}`}>
            {isDone ? `${match.score_a} - ${match.score_b}` : 'vs'}
          </span>
        )}
        {match.team_b_logo && <img src={match.team_b_logo} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" onError={e => { e.target.style.display='none'; }} />}
        <span className="font-medium truncate">{match.team_b_name || '?'}</span>
      </div>
      <div className="flex gap-2 shrink-0">
        {editing ? (
          <>
            <button onClick={() => onSave(sa, sb)} className="text-green-600 font-bold cursor-pointer">✓</button>
            <button onClick={onCancel} className="text-slate-400 cursor-pointer">✕</button>
          </>
        ) : (
          <>
            <button onClick={onEdit} className="text-[#E94560] font-bold cursor-pointer">
              {isDone ? 'Sửa' : 'Nhập kết quả'}
            </button>
            <button onClick={onDelete} className="text-slate-300 hover:text-red-400 cursor-pointer">🗑</button>
          </>
        )}
      </div>
    </div>
  );
}
