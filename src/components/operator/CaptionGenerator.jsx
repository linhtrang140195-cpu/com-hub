import { useEffect, useState, useCallback } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { generateTemplateCaption } from '../../utils/template';
import { generateUTM, slugify } from '../../utils/utm';
import { copyText } from '../../services/clipboard';
import { formatDateShort, formatTimeVN } from '../../utils/datetime';

const UPCOMING_WINDOW_DAYS = 2;

// Fields shown per campaign type
const FIELD_CONFIG = {
  giai_dau: {
    fields: ['team_a', 'team_b', 'score', 'match_round', 'key_moment', 'image_url', 'custom_prompt'],
    labels: { team_a: 'Đội A', team_b: 'Đội B', score: 'Tỷ số', match_round: 'Vòng / Trận', key_moment: 'Key moment (1 câu)' },
  },
  lnd: {
    fields: ['topic', 'speaker', 'key_moment', 'image_url', 'custom_prompt'],
    labels: { topic: 'Chủ đề buổi học', speaker: 'Diễn giả / Facilitator', key_moment: 'Takeaway chính' },
  },
  van_hoa: {
    fields: ['topic', 'key_moment', 'image_url', 'custom_prompt'],
    labels: { topic: 'Chủ đề / Hoạt động', key_moment: 'Điểm nhấn nội dung' },
  },
  event: {
    fields: ['topic', 'key_moment', 'image_url', 'custom_prompt'],
    labels: { topic: 'Tên sự kiện / Hoạt động', key_moment: 'Thông tin chính' },
  },
};
const DEFAULT_FIELD_CONFIG = {
  fields: ['topic', 'key_moment', 'image_url', 'custom_prompt'],
  labels: { topic: 'Chủ đề', key_moment: 'Nội dung chính' },
};

function getFieldConfig(campaignTypeKey) {
  return FIELD_CONFIG[campaignTypeKey] || DEFAULT_FIELD_CONFIG;
}

export default function CaptionGenerator() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCampaign, campaigns } = useOutletContext();
  const [post, setPost] = useState(null);
  const [campaign, setCampaign] = useState(activeCampaign);
  const [campaignType, setCampaignType] = useState(null);
  const [postType, setPostType] = useState('');
  const [inputs, setInputs] = useState({ team_a: '', team_b: '', score: '', key_moment: '', context: '', custom_prompt: '' });
  const [provider, setProvider] = useState('claude');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [compassLoading, setCompassLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [upcoming, setUpcoming] = useState([]);
  const [showFreeform, setShowFreeform] = useState(false);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    if (postId) return;
    const now = new Date();
    const to = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86400000);
    api.get(`/posts?operator=${user.email}&status=scheduled&from=${now.toISOString()}&to=${to.toISOString()}`)
      .then(list => setUpcoming(list.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))))
      .catch(console.error);
  }, [postId, user.email]);

  useEffect(() => {
    if (postId) {
      api.get(`/posts/${postId}`).then(p => {
        setPost(p);
        setPostType(p.post_type);
        setCampaign({ id: p.campaign_id, name: p.campaign_name, color: p.campaign_color, type: p.campaign_type, website: p.website, tone: p.tone, slogan: p.slogan, tone_rules: p.tone_rules });
        if (p.caption_hint) setInputs(i => ({ ...i, context: p.caption_hint }));
      });
    }
  }, [postId]);

  // Sync when user switches campaign tab in TopBar
  useEffect(() => {
    if (!postId && activeCampaign) {
      setCampaign(activeCampaign);
      setPostType('');
      setResult(null);
    }
  }, [activeCampaign?.id, postId]);

  // Load teams for tournament campaigns
  useEffect(() => {
    const c = post ? { id: post.campaign_id, type: post.campaign_type } : campaign;
    if (c?.id && c?.type === 'giai_dau') {
      api.get(`/tournaments/${c.id}/teams`).then(setTeams).catch(() => setTeams([]));
    } else {
      setTeams([]);
    }
  }, [campaign?.id, campaign?.type, post?.campaign_id]);

  useEffect(() => {
    const c = post ? { type: post.campaign_type } : campaign;
    if (c?.type) {
      api.get(`/campaign-types/${c.type}`).then(setCampaignType).catch(console.error);
    }
  }, [campaign, post]);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const typeInfo = campaignType?.post_types?.find(t => t.name === postType);
      const needsAI = typeInfo ? typeInfo.needs_ai : true;

      let output;
      if (needsAI) {
        if (provider === 'compass' && post) {
          output = await api.post('/caption/compass-suggest', { post_id: post.id });
        } else {
          output = await api.post('/caption/generate', {
            campaign_id: campaign.id,
            post_type: postType,
            inputs,
            date: post?.scheduled_at || new Date().toISOString(),
            provider,
          });
        }
      } else {
        output = generateTemplateCaption(postType, inputs, campaign);
      }

      if (campaign?.website) {
        const utm = generateUTM(campaign.website, slugify(campaign.name), postType, new Date().toISOString().slice(0, 10));
        output = {
          ...output,
          seatalk: output.seatalk.includes(campaign.website) ? output.seatalk.replace(campaign.website, utm) : output.seatalk,
          web: output.web,
        };
      }
      setResult(output);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (field, text) => {
    const ok = await copyText(text);
    if (ok) { setCopiedField(field); setTimeout(() => setCopiedField(''), 2000); }
  };

  const handleCompassSuggest = async () => {
    if (!post) return;
    setCompassLoading(true);
    setError('');
    try {
      const output = await api.post('/caption/compass-suggest', { post_id: post.id });
      setResult(output);
    } catch (e) {
      setError(e.message);
    } finally {
      setCompassLoading(false);
    }
  };

  const [autoMatches, setAutoMatches] = useState([]);

  // Auto-fill team/round/score from tournament website when opening a giai_dau post
  useEffect(() => {
    if (!post || post.campaign_type !== 'giai_dau' || !campaign?.website) return;
    api.get(`/tournaments/${post.campaign_id}/live-schedule`)
      .then(data => {
        const all = data.matches || [];
        if (!all.length) return;

        const postDate = new Date(post.scheduled_at);
        const pt = (post.post_type || postType || '').toLowerCase();
        const isResult = /result|highlight|recap|bxh/.test(pt);

        let ranked;
        if (isResult) {
          // Most recently completed match at or before the post date
          ranked = all
            .filter(m => m.ti_so)
            .sort((a, b) => new Date(b.thoi_gian) - new Date(a.thoi_gian));
        } else {
          // Upcoming match closest to the post date (no score yet)
          ranked = all
            .filter(m => !m.ti_so)
            .sort((a, b) =>
              Math.abs(new Date(a.thoi_gian) - postDate) - Math.abs(new Date(b.thoi_gian) - postDate)
            );
        }

        if (!ranked.length) return;
        setAutoMatches(ranked.slice(0, 6));
        if (ranked.length === 1) applyMatch(ranked[0]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, campaign?.website, postType]);

  const applyMatch = (m) => {
    setInputs(i => ({
      ...i,
      team_a: m.doi_a || i.team_a,
      team_b: m.doi_b || i.team_b,
      match_round: [m.vong, m.bang ? `Bảng ${m.bang}` : ''].filter(Boolean).join(' — ') || i.match_round,
      ...(m.ti_so ? { score: m.ti_so } : {}),
    }));
    setAutoMatches([]);
  };

  const [savedDraft, setSavedDraft] = useState(false);

  const handleSaveDraft = async () => {
    if (!post) return;
    await api.patch(`/posts/${post.id}`, {
      approval_status: 'cho_duyet',
      seatalk_caption: result?.seatalk,
      web_caption: result?.web,
      image_url: inputs.image_url || undefined,
    });
    setSavedDraft(true);
    setTimeout(() => setSavedDraft(false), 2500);
  };

  const handleMarkPosted = async () => {
    if (!post) return;
    await api.patch(`/posts/${post.id}`, {
      status: 'posted',
      seatalk_caption: result?.seatalk,
      web_caption: result?.web,
      image_url: inputs.image_url || undefined,
    });
    alert('Đã lưu bài đăng!');
  };

  const postTypeOptions = campaignType?.post_types?.map(t => t.name) || ['Preview', 'Result+BXH', 'Highlight', 'Recap ngày', 'Announce'];

  const showForm = Boolean(postId) || showFreeform || (upcoming.length === 0 && !postId);

  return (
    <div className="max-w-[640px]">
      <div className="text-[22px] font-extrabold mb-6">✍️ Viết bài</div>

      {!postId && upcoming.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="text-[11px] text-slate-400 font-bold mb-3 tracking-wide">
            📌 BÀI SẮP TỚI ({UPCOMING_WINDOW_DAYS} NGÀY TỚI)
          </div>
          {upcoming.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-slate-50 first:border-t-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.campaign_color }} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {p.campaign_name} · {formatDateShort(p.scheduled_at)} {formatTimeVN(p.scheduled_at)} · {(p.channels || []).join(', ')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/operator/write/${p.id}`)}
                className="bg-[#E94560] rounded-md px-3 py-1.5 text-white text-[11px] font-bold cursor-pointer shrink-0"
              >
                Viết bài →
              </button>
            </div>
          ))}
          {!showFreeform && (
            <button
              onClick={() => setShowFreeform(true)}
              className="text-xs text-slate-400 hover:text-slate-600 mt-3 cursor-pointer underline"
            >
              Hoặc viết tự do không theo lịch có sẵn →
            </button>
          )}
        </div>
      )}

      {post && (
        <div className="mb-4">
          <button
            onClick={handleCompassSuggest}
            disabled={compassLoading}
            className="w-full border-2 border-dashed border-[#E94560] rounded-lg py-2.5 text-[13px] text-[#E94560] font-bold cursor-pointer disabled:opacity-50 hover:bg-red-50 transition-colors"
          >
            {compassLoading ? '⏳ Compass đang gợi ý...' : '✨ AI Suggest — Compass tự sinh caption nhanh'}
          </button>
          <div className="text-[10px] text-slate-400 text-center mt-1">Dựa trên tiêu đề bài + tone campaign, không cần điền thêm</div>
        </div>
      )}

      {/* Match picker from tournament website */}
      {autoMatches.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="text-[11px] font-bold text-blue-600 mb-2 tracking-wide">
            📡 DỮ LIỆU TỪ WEBSITE — CHỌN TRẬN ĐỂ ĐIỀN TỰ ĐỘNG:
          </div>
          <div className="space-y-1">
            {autoMatches.map((m, i) => (
              <button
                key={i}
                onClick={() => applyMatch(m)}
                className="flex items-center gap-2 w-full text-left text-[12px] text-blue-700 hover:bg-blue-100 px-3 py-2 rounded-lg font-medium cursor-pointer"
              >
                <span className="font-bold shrink-0">{m.doi_a}</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${m.ti_so ? 'bg-slate-200 text-slate-700' : 'bg-blue-200 text-blue-600'}`}>
                  {m.ti_so || 'VS'}
                </span>
                <span className="font-bold shrink-0">{m.doi_b}</span>
                {m.bang && <span className="text-[10px] text-blue-400 shrink-0">Bảng {m.bang}</span>}
                {m.thoi_gian && <span className="text-[10px] text-slate-400 ml-auto shrink-0">{String(m.thoi_gian).slice(0, 10)}</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setAutoMatches([])} className="text-[10px] text-blue-400 mt-2 cursor-pointer hover:text-blue-600">
            Ẩn danh sách
          </button>
        </div>
      )}

      {showForm && (
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
        {!post && (
          <div className="mb-4">
            <div className="text-[11px] text-slate-400 font-bold mb-2 tracking-wide">CAMPAIGN</div>
            <select
              value={campaign?.id || ''}
              onChange={e => setCampaign(campaigns.find(c => c.id === e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm"
            >
              <option value="">-- Chọn campaign --</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className="text-[11px] text-slate-400 font-bold mb-3 tracking-wide">LOẠI BÀI</div>
        <div className="flex gap-2 flex-wrap mb-5">
          {postTypeOptions.map(t => (
            <button
              key={t}
              onClick={() => setPostType(t)}
              className="rounded-full px-3.5 py-1.5 text-xs cursor-pointer"
              style={{
                background: postType === t ? '#E94560' : '#F0F0F5',
                color: postType === t ? '#fff' : '#555',
                fontWeight: postType === t ? 700 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {(() => {
          const fc = getFieldConfig(campaign?.type);
          const inp = (field) => inputs[field] || '';
          const set = (field) => e => setInputs(i => ({ ...i, [field]: e.target.value }));
          const lbl = (field) => fc.labels?.[field] || field;
          const fields = fc.fields;

          return (
            <>
              {/* Pair: team_a + team_b — dropdown if teams imported, else freetext */}
              {fields.includes('team_a') && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {['team_a', 'team_b'].map(field => (
                    <div key={field}>
                      <div className="text-[11px] text-slate-400 mb-1.5">{lbl(field)}</div>
                      {teams.length > 0 ? (
                        <select
                          value={inp(field)}
                          onChange={e => {
                            const name = e.target.value;
                            setInputs(i => ({ ...i, [field]: name }));
                          }}
                          className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none bg-white"
                        >
                          <option value="">-- Chọn đội --</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input value={inp(field)} onChange={set(field)} className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* score */}
              {fields.includes('score') && (
                <div className="mb-3">
                  <div className="text-[11px] text-slate-400 mb-1.5">{lbl('score')} (optional)</div>
                  <input value={inp('score')} onChange={set('score')} className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none" />
                </div>
              )}

              {/* match_round */}
              {fields.includes('match_round') && (
                <div className="mb-3">
                  <div className="text-[11px] text-slate-400 mb-1.5">{lbl('match_round')} (optional)</div>
                  <input value={inp('match_round')} onChange={set('match_round')} placeholder="VD: Vòng bảng A — Ngày 2" className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none" />
                </div>
              )}

              {/* topic (non-tournament) */}
              {fields.includes('topic') && (
                <div className="mb-3">
                  <div className="text-[11px] text-slate-400 mb-1.5">{lbl('topic')}</div>
                  <input value={inp('topic')} onChange={set('topic')} className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none" />
                </div>
              )}

              {/* speaker (lnd) */}
              {fields.includes('speaker') && (
                <div className="mb-3">
                  <div className="text-[11px] text-slate-400 mb-1.5">{lbl('speaker')} (optional)</div>
                  <input value={inp('speaker')} onChange={set('speaker')} className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none" />
                </div>
              )}

              {/* image_url */}
              {fields.includes('image_url') && (
                <div className="mb-3">
                  <div className="text-[11px] text-slate-400 mb-1.5">🖼️ Link ảnh / visual (Google Drive, Figma, ...)</div>
                  <input value={inp('image_url')} onChange={set('image_url')} placeholder="https://drive.google.com/..." className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none" />
                </div>
              )}

              {/* key_moment */}
              <div className="mb-5">
                <div className="text-[11px] text-slate-400 mb-1.5">{lbl('key_moment')} (AI tự sinh CTA nếu bạn để trống)</div>
                <textarea
                  value={inp('key_moment')}
                  onChange={e => setInputs(i => ({ ...i, key_moment: e.target.value, context: e.target.value }))}
                  placeholder={fields.includes('team_a') ? 'VD: Đội A lật ngược từ 0-1 lên 2-1 phút 89...' : 'VD: 3 điều quan trọng nhất trong buổi hôm nay...'}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none h-[72px] resize-none"
                />
              </div>

              {/* custom_prompt */}
              <div className="mb-5">
                <div className="text-[11px] text-slate-400 mb-1.5">Custom prompt (optional — ưu tiên hơn các ô trên)</div>
                <textarea
                  value={inp('custom_prompt')}
                  onChange={set('custom_prompt')}
                  placeholder="VD: Viết theo giọng hài hước, nhắc đến đây là trận derby..."
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-[13px] outline-none h-[60px] resize-none"
                />
              </div>
            </>
          );
        })()}
        <div className="mb-5">
          <div className="text-[11px] text-slate-400 mb-1.5">AI Provider</div>
          <div className="flex gap-2">
            <button
              onClick={() => setProvider('claude')}
              className="rounded-full px-3.5 py-1.5 text-xs cursor-pointer"
              style={{
                background: provider === 'claude' ? '#E94560' : '#F0F0F5',
                color: provider === 'claude' ? '#fff' : '#555',
                fontWeight: provider === 'claude' ? 700 : 400,
              }}
            >
              🤖 Claude
            </button>
            <button
              onClick={() => setProvider('openai')}
              className="rounded-full px-3.5 py-1.5 text-xs cursor-pointer"
              style={{
                background: provider === 'openai' ? '#E94560' : '#F0F0F5',
                color: provider === 'openai' ? '#fff' : '#555',
                fontWeight: provider === 'openai' ? 700 : 400,
              }}
            >
              🟢 ChatGPT
            </button>
            <button
              onClick={() => setProvider('compass')}
              className="rounded-full px-3.5 py-1.5 text-xs cursor-pointer"
              style={{
                background: provider === 'compass' ? '#E94560' : '#F0F0F5',
                color: provider === 'compass' ? '#fff' : '#555',
                fontWeight: provider === 'compass' ? 700 : 400,
              }}
            >
              🧭 Compass
            </button>
          </div>
        </div>

        {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

        <button
          onClick={handleGenerate}
          disabled={!postType || !campaign || loading}
          className="w-full bg-[#1A1A2E] rounded-lg py-3 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Đang sinh...' : '✨ Sinh caption'}
        </button>
      </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-xs font-bold text-slate-400 tracking-wide">SEATALK VERSION</span>
              <button onClick={() => handleCopy('seatalk', result.seatalk)} className="text-xs text-[#E94560] font-bold cursor-pointer">
                {copiedField === 'seatalk' ? '✓ Đã copy' : 'Copy'}
              </button>
            </div>
            <textarea
              value={result.seatalk}
              onChange={e => setResult(r => ({ ...r, seatalk: e.target.value }))}
              className="w-full text-[13px] font-sans border border-slate-100 rounded-lg p-2 outline-none resize-none focus:border-slate-300 bg-slate-50"
              rows={Math.max(4, (result.seatalk || '').split('\n').length + 1)}
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-xs font-bold text-slate-400 tracking-wide">WEB / SAILOR VERSION</span>
              <button onClick={() => handleCopy('web', result.web)} className="text-xs text-[#E94560] font-bold cursor-pointer">
                {copiedField === 'web' ? '✓ Đã copy' : 'Copy'}
              </button>
            </div>
            <textarea
              value={result.web}
              onChange={e => setResult(r => ({ ...r, web: e.target.value }))}
              className="w-full text-[13px] font-sans border border-slate-100 rounded-lg p-2 outline-none resize-none focus:border-slate-300 bg-slate-50"
              rows={Math.max(3, (result.web || '').split('\n').length + 1)}
            />
          </div>
          {result.suggested_cta && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-xs text-amber-700">
              💡 AI gợi ý CTA: {result.suggested_cta}
            </div>
          )}
          {post && (
            <div className="flex gap-2">
              <button onClick={handleSaveDraft} className="flex-1 bg-white border border-slate-200 rounded-lg py-3 text-slate-700 text-sm font-bold cursor-pointer">
                {savedDraft ? '✓ Đã lưu, chờ duyệt' : '💾 Lưu nháp / Gửi duyệt'}
              </button>
              <button onClick={handleMarkPosted} className="flex-1 bg-green-600 rounded-lg py-3 text-white text-sm font-bold cursor-pointer">
                ✓ Đã đăng — lưu bài
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
