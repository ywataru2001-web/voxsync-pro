import React, { useState, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { 
  Play, Pause, Upload, Table, ExternalLink, 
  RefreshCw, Clock, User, ChevronRight, Search,
  RotateCcw, RotateCw, Settings, Users, X,
  LayoutDashboard, Video, Mic2, ChevronLeft, Plus, Save, Users2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabase';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetId, setSheetId] = useState('');
  const [targetAudioUrl, setTargetAudioUrl] = useState(''); 
  const [sheetName, setSheetName] = useState('');
  const [recentStudents, setRecentStudents] = useState([]); 
  const [transcription, setTranscription] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeSegmentRef = useRef(null); 
  
  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const fileInputRef = useRef(null);
  const [masterStudents, setMasterStudents] = useState([]);
  const [masterLogs, setMasterLogs] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMasterLoading, setIsMasterLoading] = useState(false);
  const [currentView, setCurrentView] = useState('audio'); // 'audio' | 'video' | 'students'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({ 
    name: '', 
    username: '', 
    avatar_url: '',
    instructor: '',
    progress: '',
    enrollment_date: '',
    success_date: ''
  });
  const [showAddLog, setShowAddLog] = useState(false);
  const [newLog, setNewLog] = useState({ script_url: '', audio_url: '', note: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [showInstructorDropdown, setShowInstructorDropdown] = useState(false);
  const [showProgressDropdown, setShowProgressDropdown] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const avatarFileRef = useRef(null);
  const instructors = ['みなと', 'なぎ', 'りん'];
  const progressOptions = [
    { label: '成果達成', color: '#ef4444' },
    { label: '成果未達成', color: '#3b82f6' },
    { label: '途中解約', color: '#10b981' },
    { label: '連絡なし', color: '#8b5cf6' },
    { label: '休憩中', color: '#6b7280' }
  ];

  const transcriptionRef = useRef([]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeIndex !== -1 && activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  // Load settings from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('voxsync_history_v2');
    if (savedHistory) setRecentStudents(JSON.parse(savedHistory));
  }, []);

  const parseTimestamp = (val, raw) => {
    if (val === undefined || val === null) return 0;
    if (Array.isArray(raw)) {
      return (raw[0] || 0) * 3600 + (raw[1] || 0) * 60 + (raw[2] || 0) + (raw[3] || 0) / 1000;
    }
    const s = String(val).trim();
    if (s.includes(':')) {
      const parts = s.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (num > 0 && num < 1 && s.includes('.')) return num * 86400;
      return num;
    }
    return 0;
  };

  const convertToDirectLink = (url) => {
    if (!url) return null;
    const s = String(url);
    if (s.includes('drive.google.com')) {
      let id = '';
      if (s.includes('/file/d/')) {
        id = s.split('/file/d/')[1].split('/')[0];
      } else if (s.includes('id=')) {
        id = s.split('id=')[1].split('&')[0];
      }
      if (id) {
        const direct = `https://docs.google.com/uc?export=download&id=${id}`;
        return `/api/proxy_audio?url=${encodeURIComponent(direct)}`;
      }
    }
    return s;
  };

  const convertToImageLink = (url) => {
    if (!url) return null;
    const s = String(url);
    if (s.includes('drive.google.com')) {
      let id = '';
      if (s.includes('/file/d/')) {
        id = s.split('/file/d/')[1].split('/')[0];
      } else if (s.includes('id=')) {
        id = s.split('id=')[1].split('&')[0];
      }
      if (id) return `https://docs.google.com/uc?export=view&id=${id}`;
    }
    return s;
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const fetchMasterData = async () => {
    setIsMasterLoading(true);
    try {
      // 1. Fetch Students
      const { data: students, error: err1 } = await supabase
        .from('students')
        .select('*')
        .order('name');
      if (err1) throw err1;

      // 2. Fetch Logs
      const { data: logs, error: err2 } = await supabase
        .from('corrections')
        .select('*')
        .order('created_at', { ascending: false });
      if (err2) throw err2;

      // 3. Fetch Lectures
      const { data: vids, error: err3 } = await supabase
        .from('lectures')
        .select('*')
        .order('created_at', { ascending: false });
      if (err3) throw err3;

      setMasterStudents(students || []);
      setMasterLogs(logs?.map(l => ({
        ...l,
        username: l.student_username, // Map to internal field name
        sheet: l.script_url,
        audio: l.audio_url
      })) || []);
      setLectures(vids || []);
    } catch (err) {
      console.error('Supabase fetch error:', err);
    } finally {
      setIsMasterLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.username) return alert('名前とユザネは必須です。');
    setIsUploading(true);
    try {
      let finalAvatarUrl = newStudent.avatar_url;

      // Handle file upload if exists
      const file = avatarFileRef.current?.files[0];
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        
        finalAvatarUrl = data.publicUrl;
      }

      const { error } = await supabase.from('students').insert([{
        ...newStudent,
        avatar_url: finalAvatarUrl
      }]);
      if (error) throw error;
      
      alert('講座生を登録しました！');
      setShowAddStudent(false);
      setImagePreview(null);
      setNewStudent({ 
        name: '', 
        username: '', 
        avatar_url: '',
        instructor: '',
        progress: '',
        enrollment_date: '',
        success_date: ''
      });
      fetchMasterData();
    } catch (err) {
      alert(`アップロード失敗: ${err.message}\n※SupabaseのStorageで'avatars'バケットを作成済みか確認してください。`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddLog = async () => {
    if (!selectedStudent) return;
    if (!newLog.script_url || !newLog.audio_url) return alert('台本と音声のURLは必須です。');
    try {
      const { error } = await supabase.from('corrections').insert([{
        ...newLog,
        student_username: selectedStudent.username
      }]);
      if (error) throw error;
      alert('添削データを保存しました！');
      setShowAddLog(false);
      setNewLog({ script_url: '', audio_url: '', note: '' });
      fetchMasterData();
    } catch (err) {
      alert(`エラー: ${err.message}`);
    }
  };

  const handleSelectLog = (log) => {
    setSheetId(log.sheet);
    setTargetAudioUrl(log.audio);
    setSheetName(log.name);
    setShowMasterModal(false);
    setSelectedStudent(null); // Reset for next time
    fetchSheetData(log.sheet, log.audio, log.name);
  };

  const fetchSheetData = async (sId = sheetId, aUrl = targetAudioUrl, sName = sheetName) => {
    if (!sId) {
      alert('スプレッドシートのURLを入力してください。');
      return;
    }
    setIsProcessing(true);
    try {
      let actualId = sId;
      if (sId.includes('/d/')) actualId = sId.split('/d/')[1].split('/')[0];
      if (sId.includes('folders/')) throw new Error('フォルダのURLではなく、スプレッドシート自体のURLを貼ってください。');

      let url = `https://docs.google.com/spreadsheets/d/${actualId}/gviz/tq?tqx=out:json`;
      if (sName) url += `&sheet=${encodeURIComponent(sName)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('シートの読み込みに失敗しました。共有設定を確認してください。');
      
      const text = await res.text();
      const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const data = JSON.parse(jsonStr);
      
      const rows = data.table.rows.map(row => {
        const cells = row.c;
        if (!cells) return null;
        return {
          start: parseTimestamp(cells[0]?.f || cells[0]?.v, cells[0]?.v),
          speaker: cells[1]?.v || cells[1]?.f || 'Unknown',
          text: cells[2]?.v || cells[2]?.f || '',
        };
      }).filter(row => row && row.text).sort((a, b) => a.start - b.start);

      if (aUrl) setAudioUrl(convertToDirectLink(aUrl));

      const enrichedRows = rows.map((row, idx) => {
        const nextStart = rows[idx + 1]?.start;
        let end = nextStart || (row.start + 5);
        if (nextStart && nextStart <= row.start) end = row.start + 1.5;
        return { ...row, end };
      });

      setTranscription(enrichedRows);
      transcriptionRef.current = enrichedRows;

      const historyItem = { id: actualId, audio: aUrl, name: sName || `Sheet-${actualId.substring(0,5)}` };
      const filtered = recentStudents.filter(item => item.id !== actualId || item.name !== sName);
      const updated = [historyItem, ...filtered].slice(0, 10);
      setRecentStudents(updated);
      localStorage.setItem('voxsync_history_v2', JSON.stringify(updated));
    } catch (err) {
      alert(`エラー: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecentClick = (item) => {
    setSheetId(item.id);
    setTargetAudioUrl(item.audio);
    setSheetName(item.name);
    fetchSheetData(item.id, item.audio, item.name);
  };

  useEffect(() => {
    if (audioUrl && waveformRef.current) {
      if (wavesurfer.current) wavesurfer.current.destroy();
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#475569',
        progressColor: '#6366f1',
        cursorColor: '#6366f1',
        barWidth: 2,
        barRadius: 3,
        responsive: true,
        height: 80,
        normalize: true,
      });
      wavesurfer.current.load(audioUrl);
      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));
      wavesurfer.current.on('timeupdate', (time) => {
        setCurrentTime(time);
        const segments = transcriptionRef.current;
        if (!segments || segments.length === 0) return;
        let foundIndex = segments.findIndex(item => time >= item.start && time < item.end);
        if (foundIndex === -1) {
          const lastBefore = [...segments].reverse().find(s => time >= s.start);
          if (lastBefore) {
            const idx = segments.indexOf(lastBefore);
            if (time < lastBefore.end + 2.0) foundIndex = idx;
          }
        }
        setActiveIndex(foundIndex);
      });
      return () => wavesurfer.current?.destroy();
    }
  }, [audioUrl]);

  const togglePlay = () => wavesurfer.current?.playPause();
  const jumpToTime = (time) => {
    wavesurfer.current?.setTime(time);
    wavesurfer.current?.play();
  };
  const skipTime = (amount) => {
    if (wavesurfer.current) {
      const current = wavesurfer.current.getCurrentTime();
      const duration = wavesurfer.current.getDuration();
      let newTime = current + amount;
      if (newTime < 0) newTime = 0;
      if (newTime > duration) newTime = duration;
      wavesurfer.current.setTime(newTime);
    }
  };

  return (
    <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-icon small">A</div>
          {!isSidebarCollapsed && <div className="logo-text">atena <span className="badge">PRO</span></div>}
          <button className="collapse-btn" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
            <ChevronLeft size={16} className={isSidebarCollapsed ? 'rotate-180' : ''} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${currentView === 'audio' ? 'active' : ''}`} onClick={() => setCurrentView('audio')}>
            <Mic2 size={20} />
            {!isSidebarCollapsed && <span>音声添削</span>}
            {currentView === 'audio' && !isSidebarCollapsed && <motion.div layoutId="nav-glow" className="nav-glow" />}
          </button>
          <button className={`nav-item ${currentView === 'students' ? 'active' : ''}`} onClick={() => setCurrentView('students')}>
            <Users2 size={20} />
            {!isSidebarCollapsed && <span>講座生管理</span>}
            {currentView === 'students' && !isSidebarCollapsed && <motion.div layoutId="nav-glow" className="nav-glow" />}
          </button>
          <button className={`nav-item ${currentView === 'video' ? 'active' : ''}`} onClick={() => setCurrentView('video')}>
            <Video size={20} />
            {!isSidebarCollapsed && <span>動画講義</span>}
            {currentView === 'video' && !isSidebarCollapsed && <motion.div layoutId="nav-glow" className="nav-glow" />}
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={20} />
            {!isSidebarCollapsed && <span>設定</span>}
          </button>
        </div>
      </aside>

      <div className="content-wrapper">
        <header className="header">
          <div className="header-left">
            <h3>{currentView === 'audio' ? '音声添削ダッシュボード' : '動画講義ライブラリ'}</h3>
          </div>
          
          <div className="header-actions">
            {currentView === 'audio' && (
              <button className="btn btn-secondary" onClick={() => setShowMasterModal(true)}>
                <Users size={16} /> 講座生リスト
              </button>
            )}
            <button className="icon-btn-plain" onClick={() => setShowSettings(!showSettings)}>
              <Settings size={20} />
            </button>
          </div>
          
          {currentView === 'audio' && (
            <div className="sheet-selector">
              <div className="input-group">
                <div className="input-with-icon url-input">
                  <Table size={16} />
                  <input type="text" placeholder="台本シートURL..." value={sheetId} onChange={(e) => setSheetId(e.target.value)} />
                </div>
                <div className="input-with-icon audio-input">
                  <Play size={16} />
                  <input type="text" placeholder="音声ドライブURL..." value={targetAudioUrl} onChange={(e) => setTargetAudioUrl(e.target.value)} />
                </div>
                <div className="input-with-icon student-input">
                  <User size={16} />
                  <input type="text" placeholder="生徒名..." value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => fetchSheetData()} disabled={isProcessing}>
                {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <ExternalLink size={16} />} 読込
              </button>
            </div>
          )}
        </header>

        <AnimatePresence>
          {showSettings && (
            <motion.div className="settings-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <div className="settings-inner">
                <button className="btn btn-primary" onClick={() => { fetchMasterData(); setShowSettings(false); }}>
                  <RefreshCw size={16} /> データを最新に更新
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {currentView === 'audio' && (
          <>
            {recentStudents.length > 0 && (
              <div className="history-bar px-8">
                <span className="label">履歴:</span>
                {recentStudents.map((item, idx) => (
                  <button key={idx} className={`history-tag ${String(sheetId).includes(item.id) && sheetName === item.name ? 'active' : ''}`} onClick={() => handleRecentClick(item)}>
                    {item.name}
                  </button>
                ))}
              </div>
            )}

            <main className="main-layout flex-col">
              <section className="player-section mb-6">
                <div className="visualizer-card">
                  {!audioUrl ? (
                    <div className="empty-state" onClick={() => fileInputRef.current.click()}>
                      <Upload size={48} className="icon-pulse mb-4" />
                      <h2>音声ファイルをアップロードして開始</h2>
                      <p>または上の「音声ドライブURL」を入力してください</p>
                    </div>
                  ) : (
                    <div className="player-inner">
                      <div id="waveform" ref={waveformRef}></div>
                      <div className="player-controls">
                        <button className="btn-icon" onClick={() => skipTime(-10)} title="10秒戻る">
                          <RotateCcw size={24} />
                        </button>
                        <button className="play-btn" onClick={togglePlay}>
                          {isPlaying ? <Pause size={32} /> : <Play size={32} />}
                        </button>
                        <button className="btn-icon" onClick={() => skipTime(10)} title="10秒進む">
                          <RotateCw size={24} />
                        </button>
                        <div className="time-info">
                          <span className="current">{formatTime(currentTime)}</span>
                          <span className="divider">/</span>
                          <span className="duration">
                            {wavesurfer.current ? formatTime(wavesurfer.current.getDuration()) : '0:00'}
                          </span>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current.click()} style={{ marginLeft: 'auto' }}>
                          <Upload size={14} /> ファイル変更
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {activeIndex !== -1 && transcription[activeIndex] && (
                    <motion.div className="now-playing-card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                      <div className="active-speaker">
                        <div className="speaker-dot"></div>
                        <User size={14} /> 
                        <span>{transcription[activeIndex].speaker}</span>
                      </div>
                      <div className="active-text">{transcription[activeIndex].text}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <section className="transcript-section">
                <div className="section-header">
                  <h3><Clock size={18} /> 台本タイムライン</h3>
                  {transcription.length > 0 && <span className="count">{transcription.length} 行</span>}
                </div>
                <div className="transcript-list">
                  {transcription.length === 0 ? (
                    <div className="empty-transcript">
                      <p>データを読み込んでください</p>
                      <div className="format-hint">A列: 時間 / B列: 話者 / C列: 内容</div>
                    </div>
                  ) : (
                    transcription.map((item, index) => (
                      <motion.div
                        key={index}
                        ref={index === activeIndex ? activeSegmentRef : null}
                        className={`transcript-row ${index === activeIndex ? 'active' : ''}`}
                        onClick={() => jumpToTime(item.start)}
                      >
                        <div className="time-tag">{formatTime(item.start)}</div>
                        <div className="speaker-tag"><User size={12} /> {item.speaker}</div>
                        <div className="content">
                          {item.text}
                          {index === activeIndex && <motion.div layoutId="spark" className="active-glow" />}
                        </div>
                        <ChevronRight size={16} className="arrow" />
                      </motion.div>
                    ))
                  )}
                </div>
              </section>
            </main>
          </>
        )}

        {currentView === 'students' && (
          <main className="main-layout p-8">
            <div className="section-header mb-8">
              <h2><Users2 size={24} /> 講座生管理</h2>
              <button className="btn btn-primary" onClick={() => setShowAddStudent(true)}>
                <Plus size={16} /> 新規講座生を登録
              </button>
            </div>

            <div className="modal-search mb-8" style={{ background: 'var(--bg-card)' }}>
              <Search size={18} />
              <input type="text" placeholder="名前で検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="student-grid dashboard-grid">
              {isMasterLoading ? (
                <div className="loading-state"><RefreshCw className="animate-spin" /> 読み込み中...</div>
              ) : (
                masterStudents.filter(s => (s.name || '').toLowerCase().includes(searchTerm.toLowerCase())).map((student, idx) => (
                  <button key={idx} className="student-card large detailed" onClick={() => { setSelectedStudent(student); setShowMasterModal(true); }}>
                    <div className="card-top">
                      <div className="avatar">
                        {student.avatar_url ? (
                          <img src={convertToImageLink(student.avatar_url)} alt={student.name} />
                        ) : (
                          (student.name?.[0] || 'U').toUpperCase()
                        )}
                      </div>
                      <div className="name-info">
                        <span className="name">{student.name}</span>
                        <span className="sub">@{student.username}</span>
                      </div>
                    </div>

                    <div className="status-capsule">
                      <div className="stat-item">
                        <label>担当講師</label>
                        <value>{student.instructor || '未設定'}</value>
                      </div>
                      <div className="stat-item">
                        <label>進捗状況</label>
                        <div className="status-tag" style={{ 
                          color: progressOptions.find(p => p.label === student.progress)?.color || '#fff',
                          background: (progressOptions.find(p => p.label === student.progress)?.color || '#fff') + '15',
                          borderColor: (progressOptions.find(p => p.label === student.progress)?.color || '#fff') + '40',
                          padding: '2px 10px',
                          fontSize: '0.7rem'
                        }}>
                          {student.progress || '---'}
                        </div>
                      </div>
                      <div className="stat-item">
                        <label>入塾日</label>
                        <value>{student.enrollment_date ? student.enrollment_date.replace(/-/g, '/') : '---'}</value>
                      </div>
                      <div className="stat-item">
                        <label>成果達成</label>
                        <value style={{ color: student.success_date ? '#34d399' : 'inherit' }}>
                          {student.success_date ? student.success_date.replace(/-/g, '/') : '---'}
                        </value>
                      </div>
                    </div>

                    <div className="card-footer">
                      <div className="log-count">
                        <Mic2 size={12} />
                        <span>{masterLogs.filter(l => l.student_username === student.username).length} 件</span>
                      </div>
                      <div className="action-arrow">
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </main>
        )}

        {currentView === 'video' && (
          <main className="main-layout p-8">
            <div className="section-header mb-8">
              <h2><Video size={20} /> 動画講義ライブラリ</h2>
              <span className="count">{lectures.length} 本の講義</span>
            </div>
            
            <div className="video-grid">
              {lectures.length === 0 ? (
                <div className="empty-state">
                  <Video size={48} className="mb-4" />
                  <p>講義データがありません。Supabaseのlecturesテーブルにデータを追加してください。</p>
                </div>
              ) : (
                lectures.map((vid, idx) => (
                  <motion.div key={idx} className="video-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                    <div className="video-thumb">
                      <iframe 
                        width="100%" 
                        height="100%" 
                        src={`https://www.youtube.com/embed/${vid.youtube_url.split('v=')[1]?.split('&')[0] || vid.youtube_url.split('/').pop()}`}
                        title={vid.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                    <div className="video-info">
                      <div className="tag">{vid.category || '一般講義'}</div>
                      <h4>{vid.title}</h4>
                      <p>YouTubeで見たい方は<a href={vid.youtube_url} target="_blank" rel="noreferrer">こちら <ExternalLink size={12} /></a></p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </main>
        )}
      </div>

      <input type="file" ref={fileInputRef} onChange={(e) => {
        const file = e.target.files[0];
        if (file) setAudioUrl(URL.createObjectURL(file));
      }} accept="audio/*" style={{ display: 'none' }} />

      {/* Master Student List Modal */}
      <AnimatePresence>
        {showMasterModal && (
          <div className="modal-overlay" onClick={() => { setShowMasterModal(false); setSelectedStudent(null); }}>
            <motion.div className="modal-content" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <div className="modal-header">
                <h3><Users size={20} /> 講座生リスト</h3>
                <button className="btn-close" onClick={() => { setShowMasterModal(false); setSelectedStudent(null); }}><X size={20} /></button>
              </div>
              
              {!selectedStudent ? (
                <>
                  <div className="modal-search">
                    <Search size={18} />
                    <input type="text" placeholder="名前で検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />
                  </div>
                  <div className="student-grid">
                    <button className="student-card add-btn" onClick={() => setShowAddStudent(true)}>
                      <div className="avatar"><Plus size={20} /></div>
                      <div className="info">
                        <div className="name">新しい講座生を登録</div>
                      </div>
                    </button>
                    {isMasterLoading ? (
                      <div className="loading-state"><RefreshCw className="animate-spin" /> 読み込み中...</div>
                    ) : masterStudents.length === 0 ? (
                      <div className="empty-state">
                        <p>データがありません。右上の＋から登録してください。</p>
                      </div>
                    ) : (
                      masterStudents.filter(s => (s.name || '').toLowerCase().includes(searchTerm.toLowerCase())).map((student, idx) => (
                        <button key={idx} className="student-card" onClick={() => setSelectedStudent(student)}>
                          <div className="avatar">
                            {student.avatar_url ? (
                              <img src={convertToImageLink(student.avatar_url)} alt={student.name} />
                            ) : (
                              (student.name?.[0] || 'U').toUpperCase()
                            )}
                          </div>
                          <div className="info">
                            <div className="name">{student.name}</div>
                            <div className="sub">@{student.username}</div>
                          </div>
                          <ChevronRight size={16} />
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="modal-breadcrumb" onClick={() => setSelectedStudent(null)}>
                    <ChevronRight size={16} className="rotate-180" /> 講座生一覧に戻る
                  </div>
                  <div className="selected-student-header">
                    <div className="avatar">
                      {selectedStudent.avatar_url ? <img src={convertToImageLink(selectedStudent.avatar_url)} alt="" /> : selectedStudent.name[0]}
                    </div>
                    <div>
                      <div className="name">{selectedStudent.name}</div>
                      <div className="sub">@{selectedStudent.username}</div>
                    </div>
                  </div>
                  <div className="student-grid">
                    <div className="section-header">
                      <div className="section-label">添削履歴</div>
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        setNewLog({ ...newLog, script_url: sheetId, audio_url: targetAudioUrl });
                        setShowAddLog(true);
                      }}>
                        <Plus size={14} /> 新規追加
                      </button>
                    </div>
                    {masterLogs.filter(l => l.username === selectedStudent.username).length === 0 ? (
                      <div className="empty-state">添削データが見つかりません</div>
                    ) : (
                      masterLogs.filter(l => l.username === selectedStudent.username).map((log, idx) => (
                        <button key={idx} className="student-card" onClick={() => handleSelectLog(log)}>
                          <div className="info">
                            <div className="name">{log.note || '無題の添削'}</div>
                            <div className="sub">{log.name}</div>
                          </div>
                          <Play size={16} />
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Student Modal */}
      <AnimatePresence>
        {showAddStudent && (
          <div className="modal-overlay" onClick={() => setShowAddStudent(false)}>
            <motion.div className="modal-content" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <div className="modal-header">
                <h3><Plus size={20} /> 講座生の新規登録</h3>
                <button className="btn-close" onClick={() => setShowAddStudent(false)}><X size={20} /></button>
              </div>
              <div className="form-content">
                <div className="form-section-title">基本情報</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>お名前 (表示名)</label>
                    <input type="text" placeholder="例: 田中 太郎" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>ユーザーネーム (ID)</label>
                    <input type="text" placeholder="例: tanaka_01" value={newStudent.username} onChange={e => setNewStudent({...newStudent, username: e.target.value})} />
                  </div>
                </div>

                <div className="form-section-title">運営・管理情報</div>
                <div className="form-row">
                  <div className="form-group relative">
                    <label>担当講師</label>
                    <div className="custom-select-trigger" onClick={() => setShowInstructorDropdown(!showInstructorDropdown)}>
                      {newStudent.instructor || '選択して下さい'}
                      <ChevronRight size={16} className={`arrow-icon ${showInstructorDropdown ? 'rotate-90' : ''}`} />
                    </div>
                    
                    <AnimatePresence>
                      {showInstructorDropdown && (
                        <motion.div className="custom-select-options" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                          {instructors.map(name => (
                            <div key={name} className="select-option" onClick={() => {
                              setNewStudent({...newStudent, instructor: name});
                              setShowInstructorDropdown(false);
                            }}>
                              {name}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="form-group relative">
                    <label>進捗ステータス</label>
                    <div className="custom-select-trigger" onClick={() => setShowProgressDropdown(!showProgressDropdown)}>
                      <span style={{ color: progressOptions.find(p => p.label === newStudent.progress)?.color }}>
                        {newStudent.progress || '選択して下さい'}
                      </span>
                      <ChevronRight size={16} className={`arrow-icon ${showProgressDropdown ? 'rotate-90' : ''}`} />
                    </div>
                    
                    <AnimatePresence>
                      {showProgressDropdown && (
                        <motion.div className="custom-select-options" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                          {progressOptions.map(opt => (
                            <div key={opt.label} className="select-option" style={{ color: opt.color }} onClick={() => {
                              setNewStudent({...newStudent, progress: opt.label});
                              setShowProgressDropdown(false);
                            }}>
                              <div className="status-dot" style={{ backgroundColor: opt.color }}></div>
                              {opt.label}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>入塾日</label>
                    <input type="date" value={newStudent.enrollment_date} onChange={e => setNewStudent({...newStudent, enrollment_date: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>成果達成日 (任意)</label>
                    <input type="date" value={newStudent.success_date} onChange={e => setNewStudent({...newStudent, success_date: e.target.value})} />
                  </div>
                </div>

                <div className="form-section-title">アイコン設定</div>
                <div className="form-group">
                  <div className="upload-zone" onClick={() => avatarFileRef.current.click()}>
                    {imagePreview ? (
                      <div className="preview-container">
                        <img src={imagePreview} alt="Preview" />
                        <div className="change-hint">クリックして画像を変更</div>
                      </div>
                    ) : (
                      <div className="upload-placeholder">
                        <Upload size={32} />
                        <span>クリックしてアイコンをアップロード</span>
                        <p>または下のURLを直接入力</p>
                      </div>
                    )}
                    <input type="file" ref={avatarFileRef} accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files[0];
                      if (file) {
                        setNewStudent({...newStudent, avatar_url: 'FILE:' + file.name});
                        const reader = new FileReader();
                        reader.onloadend = () => setImagePreview(reader.result);
                        reader.readAsDataURL(file);
                      }
                    }} />
                  </div>
                </div>

                <div className="form-group">
                  <input type="text" placeholder="画像URL（アップロードしない場合）" value={newStudent.avatar_url?.startsWith('FILE:') ? '' : newStudent.avatar_url} onChange={e => {
                    setNewStudent({...newStudent, avatar_url: e.target.value});
                    setImagePreview(null);
                  }} />
                </div>

                <button className="btn btn-primary mt-4" onClick={handleAddStudent} disabled={isUploading} style={{ padding: '16px', fontSize: '1.1rem' }}>
                  {isUploading ? <RefreshCw className="animate-spin" size={20} /> : '講座生を登録する'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Log Modal */}
      <AnimatePresence>
        {showAddLog && (
          <div className="modal-overlay" onClick={() => setShowAddLog(false)}>
            <motion.div className="modal-content" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <div className="modal-header">
                <h3><Save size={20} /> 添削データの保存</h3>
                <button className="btn-close" onClick={() => setShowAddLog(false)}><X size={20} /></button>
              </div>
              <div className="form-content p-6 flex flex-col gap-4">
                <div className="selection-preview mb-4">
                  <strong>対象:</strong> {selectedStudent?.name} (@{selectedStudent?.username})
                </div>
                <div className="form-group">
                  <label>メモ / 回数</label>
                  <input type="text" placeholder="例: 第1回、修正版など" value={newLog.note} onChange={e => setNewLog({...newLog, note: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>台本シートURL</label>
                  <input type="text" value={newLog.script_url} onChange={e => setNewLog({...newLog, script_url: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>音声ドライブURL</label>
                  <input type="text" value={newLog.audio_url} onChange={e => setNewLog({...newLog, audio_url: e.target.value})} />
                </div>
                <button className="btn btn-primary mt-4" onClick={handleAddLog}>
                  この添削を記録する
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
