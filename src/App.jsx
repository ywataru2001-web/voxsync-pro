import React, { useState, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { 
  Play, Pause, Upload, Table, ExternalLink, 
  RefreshCw, Clock, User, ChevronRight, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('voxsync_history_v2');
    if (saved) setRecentStudents(JSON.parse(saved));
  }, []);

  const parseTimestamp = (val, raw) => {
    if (val === undefined || val === null) return 0;
    
    // If Google Sheets returns a time array [hours, minutes, seconds, milliseconds]
    if (Array.isArray(raw)) {
      return (raw[0] || 0) * 3600 + (raw[1] || 0) * 60 + (raw[2] || 0) + (raw[3] || 0) / 1000;
    }

    const s = String(val).trim();
    
    // Pattern: HH:MM:SS or MM:SS
    if (s.includes(':')) {
      const parts = s.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    
    // If it's a numeric string or number
    const num = parseFloat(val);
    if (!isNaN(num)) {
      // Small fractional numbers (e.g., < 0.1) are usually day-fractions from Google Sheets durations
      // For example, 15 seconds is approx 0.0001736. 
      // If it's less than 1, we assume it's a day fraction, but 1.0 could be 1 second or 1 day.
      // Usually, durations for calls are less than 1 day.
      if (num > 0 && num < 1 && s.includes('.')) {
        return num * 86400;
      }
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

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const fetchSheetData = async (sId = sheetId, aUrl = targetAudioUrl, sName = sheetName) => {
    if (!sId) {
      alert('スプレッドシートのURLを入力してください。');
      return;
    }
    setIsProcessing(true);
    try {
      let actualId = sId;
      if (sId.includes('/d/')) {
        actualId = sId.split('/d/')[1].split('/')[0];
      }

      if (sId.includes('folders/')) {
        throw new Error('フォルダのURLではなく、スプレッドシート自体のURLを貼ってください。');
      }

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
        // Prefer formatted string (f) for timestamp parsing, but pass raw (v) for detection
        return {
          start: parseTimestamp(cells[0]?.f || cells[0]?.v, cells[0]?.v),
          speaker: cells[1]?.v || cells[1]?.f || 'Unknown',
          text: cells[2]?.v || cells[2]?.f || '',
        };
      }).filter(row => row && row.text).sort((a, b) => a.start - b.start);

      if (aUrl) setAudioUrl(convertToDirectLink(aUrl));

      const enrichedRows = rows.map((row, idx) => ({
        ...row,
        end: rows[idx + 1]?.start || row.start + 5
      }));

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
        const index = transcriptionRef.current.findIndex(
          item => time >= item.start && time < item.end
        );
        setActiveIndex(index);
      });
      return () => wavesurfer.current?.destroy();
    }
  }, [audioUrl]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) setAudioUrl(URL.createObjectURL(file));
  };

  const togglePlay = () => wavesurfer.current?.playPause();
  const jumpToTime = (time) => {
    wavesurfer.current?.setTime(time);
    wavesurfer.current?.play();
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-group">
          <div className="logo-icon">V</div>
          <div className="logo-text">VoxSync <span className="badge">PRO</span></div>
        </div>
        
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
      </header>

      {recentStudents.length > 0 && (
        <div className="history-bar">
          <span className="label">履歴:</span>
          {recentStudents.map((item, idx) => (
            <button key={idx} className={`history-tag ${sheetId.includes(item.id) && sheetName === item.name ? 'active' : ''}`} onClick={() => handleRecentClick(item)}>
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
                  <button className="play-btn" onClick={togglePlay}>{isPlaying ? <Pause size={32} /> : <Play size={32} />}</button>
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
              <motion.div className="now-playing-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="active-speaker"><User size={16} /> <span>{transcription[activeIndex].speaker}</span></div>
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

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" style={{ display: 'none' }} />
    </div>
  );
}

export default App;
