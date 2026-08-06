import { useEffect, useState, useRef } from 'react';
import { api } from '../../services/api';
import { formatDateShort } from '../../utils/datetime';

export default function TournamentPanel({ campaignId }) {
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [addingMatch, setAddingMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({ round_name: '', match_date: '', team_a_id: '', team_b_id: '' });
  const [editingResult, setEditingResult] = useState(null);
  const fileRef = useRef();

  const load = async () => {
    const [t, m] = await Promise.all([
      api.get(`/tournaments/${campaignId}/teams`),
      api.get(`/tournaments/${campaignId}/matches`),
    ]);
    setTeams(t);
    setMatches(m);
  };

  useEffect(() => { load(); }, [campaignId]);

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

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-bold text-slate-400 tracking-wide">🏆 DỮ LIỆU GIẢI ĐẤU</div>
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="text-xs bg-slate-100 hover:bg-slate-200 rounded-md px-3 py-1.5 font-semibold cursor-pointer disabled:opacity-50"
          >
            {importing ? 'Đang import...' : '📥 Import CSV đội'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
        </div>
      </div>
      {importMsg && <div className="text-xs text-green-700 mb-3">{importMsg}</div>}

      {/* Teams grid */}
      {teams.length > 0 && (
        <div className="mb-5">
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

      {/* Matches */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-slate-400">LỊCH TRẬN ({matches.length})</div>
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
            {teams.length === 0 ? 'Import CSV đội trước, sau đó thêm lịch trận.' : 'Chưa có trận nào — nhấn + Thêm trận.'}
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
