import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { formatDateShort } from '../../utils/datetime';
import { getPostStatusInfo } from '../../utils/postStatus';
import Badge from '../shared/Badge';
import StatInput from './StatInput';

export default function PostHistory() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);

  const load = useCallback(() => {
    api.get(`/posts?operator=${user.email}`).then(setPosts).catch(console.error);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...posts].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));

  return (
    <div>
      <div className="text-[22px] font-extrabold mb-6">📋 Lịch sử đăng bài</div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_90px_100px_1fr_100px] px-5 py-2.5 bg-[#F8F9FF] text-[10px] text-slate-400 font-bold tracking-wider gap-2">
          <span>NGÀY</span><span>BÀI ĐĂNG</span><span>TRẠNG THÁI</span><span>KÊNH</span><span>SEATALK STAT</span><span>WEB</span>
        </div>
        {sorted.map(p => {
          const statusInfo = getPostStatusInfo(p);
          return (
            <div key={p.id} className={`grid grid-cols-[80px_1fr_90px_100px_1fr_100px] px-5 py-3.5 border-t border-slate-50 items-center gap-2 text-xs ${p.status !== 'posted' ? 'bg-amber-50/40' : ''}`}>
              <span className="text-slate-400">{formatDateShort(p.scheduled_at)}</span>
              <div>
                <div className={p.status === 'posted' ? 'font-medium' : 'text-slate-400'}>{p.title}</div>
                {p.visual_template && <div className="text-[10px] text-slate-400">🎨 {p.visual_template}</div>}
              </div>
              <span><Badge label={statusInfo.label} color={statusInfo.color} bg={statusInfo.bg} /></span>
              <span className="text-slate-500">{(p.channels || []).join(', ')}</span>
              {p.status === 'posted' ? (
                <>
                  <span className="text-slate-600">{p.st_seen} seen · {p.st_react} react · {p.st_reply} reply</span>
                  <span className="text-slate-500">{p.web_views} views</span>
                </>
              ) : (
                <StatInput post={p} onSaved={load} />
              )}
            </div>
          );
        })}
        {sorted.length === 0 && <div className="p-5 text-sm text-slate-400">Chưa có bài nào.</div>}
      </div>
    </div>
  );
}
