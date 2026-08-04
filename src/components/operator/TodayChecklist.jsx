import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { isToday, formatTimeVN } from '../../utils/datetime';
import ProgressBar from '../shared/ProgressBar';
import Badge from '../shared/Badge';

export default function TodayChecklist() {
  const { user } = useAuth();
  const { activeCampaign } = useOutletContext();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get(`/posts?operator=${user.email}`)
      .then(all => setPosts(all.filter(p => isToday(p.scheduled_at))))
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [user.email]);

  const done = posts.filter(p => p.status === 'posted');
  const pending = posts.filter(p => p.status !== 'posted');

  const handleToggleComplete = async (post) => {
    const nextStatus = post.status === 'posted' ? 'scheduled' : 'posted';
    const body = nextStatus === 'scheduled' ? { status: nextStatus, posted_at: null } : { status: nextStatus };
    await api.patch(`/posts/${post.id}`, body);
    load();
  };

  const todayLabel = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="text-[22px] font-extrabold mb-1">✅ Hôm nay — {todayLabel}</div>
          <div className="text-[13px] text-slate-400">{done.length}/{posts.length} việc hoàn thành</div>
        </div>
        {activeCampaign && (
          <div className="bg-slate-100 rounded-lg px-3.5 py-2 text-xs text-slate-600">
            Campaign: <strong>{activeCampaign.name}</strong>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-5">
        <div className="flex justify-between mb-2 text-xs text-slate-400">
          <span>Tiến độ hôm nay</span>
          <span className="font-bold" style={{ color: done.length === posts.length && posts.length > 0 ? '#4CAF50' : '#E94560' }}>
            {done.length}/{posts.length}
          </span>
        </div>
        <ProgressBar value={done.length} total={posts.length || 1} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
        {loading && <div className="p-5 text-sm text-slate-400">Đang tải...</div>}
        {!loading && posts.length === 0 && <div className="p-5 text-sm text-slate-400">Không có việc gì hôm nay 🎉</div>}
        {posts.map((p, i) => {
          const isDone = p.status === 'posted';
          return (
            <div key={p.id} className={`flex items-start gap-3.5 px-5 py-4 border-t border-slate-50 first:border-t-0 ${isDone ? 'bg-green-50/40' : ''}`}>
              <div
                onClick={() => handleToggleComplete(p)}
                className="w-5 h-5 rounded shrink-0 mt-0.5 border-2 cursor-pointer flex items-center justify-center"
                style={{ borderColor: isDone ? '#4CAF50' : '#ddd', background: isDone ? '#4CAF50' : 'transparent' }}
              >
                {isDone && <span className="text-xs text-white">✓</span>}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-medium ${isDone ? 'text-slate-400 line-through' : ''}`}>{p.title}</span>
                  <Badge label={p.post_type} color="#E94560" bg="#FEE2E2" />
                </div>
                <div className="text-[11px] text-slate-400">{(p.channels || []).join(', ')} · {formatTimeVN(p.scheduled_at)}</div>
              </div>
              {!isDone && (
                <button
                  onClick={() => navigate(`/operator/write/${p.id}`)}
                  className="bg-[#E94560] rounded-md px-3 py-1.5 text-white text-[11px] font-bold cursor-pointer shrink-0"
                >
                  Viết bài →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
