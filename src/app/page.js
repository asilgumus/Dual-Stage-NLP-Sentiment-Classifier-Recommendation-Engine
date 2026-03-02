'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const fileInputRef = useRef(null);
  const appRef = useRef(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('hf_token');
    if (savedToken) setHfToken(savedToken);
  }, []);

  const handleTokenChange = (e) => {
    const val = e.target.value;
    setHfToken(val);
    localStorage.setItem('hf_token', val);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      setError('Please upload a valid .txt file.');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setText(event.target.result);
      setError('');
    };
    reader.onerror = () => {
      setError('Error reading file');
    };
    reader.readAsText(file);
  };

  const scrollToApp = () => {
    appRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const analyzeSentiment = async () => {
    if (!hfToken.trim()) {
      setError('Please provide a Hugging Face API Token.');
      return;
    }

    if (!text.trim()) {
      setError('Please enter text or upload a file.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const textsArray = text.split(/\r?\n/)
        .map(t => t.trim())
        .filter(t => t.length > 0);

      if (textsArray.length === 0) {
        throw new Error("No sentences found to analyze.");
      }

      const payload = textsArray.length === 1
        ? { text: textsArray[0], hf_token: hfToken }
        : { texts: textsArray, hf_token: hfToken };

      const apiUrl = process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '/api/analyze';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch(err => {
        throw new Error(`Connection failed. ${err.message}`);
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-background">
          <div className="blob hero-blob-1"></div>
          <div className="blob hero-blob-2"></div>
        </div>
        <div className="hero-content">
          <h1 className="hero-title">Elevate Your Customer Experience</h1>
          <p className="hero-subtitle">
            Harness the power of neural networks to uncover sentiments and generate actionable, AI-driven insights from your text data.
          </p>
          <button className="btn-primary" onClick={scrollToApp}>
            Initialize Workspace
          </button>
        </div>
      </section>

      {/* Main App Section */}
      <main className="app-container" ref={appRef}>
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>

        <div className="glass-card">
          <header className="header">
            <h2 className="title">NLP-Based Sentiment Analysis</h2>
            <p className="subtitle">Execute continuous text classification workflows</p>
          </header>

          <section className="input-container">
            <div className="token-input-wrapper">
              <label htmlFor="hf-token" className="input-label">Access Token</label>
              <input
                id="hf-token"
                type="password"
                className="settings-input"
                placeholder="Secure API authentication token"
                value={hfToken}
                onChange={handleTokenChange}
              />
            </div>

            <div className="textarea-wrapper">
              <div className="upload-header">
                <label className="input-label">Data Source</label>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
                <button
                  className="btn-upload"
                  onClick={() => fileInputRef.current.click()}
                >
                  <span>{fileName ? fileName : 'Attach .txt document'}</span>
                </button>
              </div>

              <textarea
                className="text-area"
                value={text}
                onChange={(e) => { setText(e.target.value); setFileName(''); }}
                placeholder="Input textual data for evaluation..."
                disabled={loading}
              />
            </div>

            <button
              className="btn-analyze"
              onClick={analyzeSentiment}
              disabled={loading || !text.trim() || !hfToken.trim()}
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  <span>Processing {text.split(/\r?\n/).filter(t => t.trim()).length} objects...</span>
                </>
              ) : (
                'Execute Analysis'
              )}
            </button>
          </section>

          {error && <div className="error-msg">{error}</div>}

          {/* Single Result Viewer */}
          {result && !result.is_bulk && (
            <div className={`result-container ${result.label?.toLowerCase()}`}>
              <div className="result-details">
                <div className="status-indicator"></div>
                <h2 className="result-label">{result.label}</h2>
                <p className="result-description">The primary sentiment vector detected is {result.label.toLowerCase()}.</p>
                <div className="confidence-bar-bg">
                  <div className="confidence-bar-fill" style={{ width: `${Math.round(result.score * 100)}%` }}></div>
                </div>
                <div className="confidence-text">
                  <span>Confidence Index</span>
                  <span>{Math.round(result.score * 100)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Result Viewer */}
          {result && result.is_bulk && (
            <div className={`result-container bulk-result ${result.overall_label?.toLowerCase()}`}>
              <div className="bulk-header">
                <div className={`overall-dot ${result.overall_label.toLowerCase()}`}></div>
                <div>
                  <h3 className="bulk-title">Aggregate Telemetry</h3>
                  <p className="bulk-subtitle">Analyzed {result.total} individual entries</p>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card positive">
                  <span className="stat-label">Positive Volume</span>
                  <span className="stat-val">{result.stats.positive.percentage}%</span>
                  <div className="mini-bar-bg"><div className="mini-bar-fill" style={{ width: `${result.stats.positive.percentage}%` }}></div></div>
                </div>

                <div className="stat-card negative">
                  <span className="stat-label">Negative Volume</span>
                  <span className="stat-val">{result.stats.negative.percentage}%</span>
                  <div className="mini-bar-bg"><div className="mini-bar-fill" style={{ width: `${result.stats.negative.percentage}%` }}></div></div>
                </div>
              </div>

              <div className="overall-verdict">
                Dominant Sentiment Vector: <strong>{result.overall_label}</strong>
              </div>
            </div>
          )}

          {/* AI Improvement Suggestions Panel */}
          {result && result.improvement_suggestion && (
            <div className="suggestion-container">
              <div className="suggestion-header">
                <div className="ai-sparkle"></div>
                <h3 className="suggestion-title">LLM-Based Negative Comment Analysis</h3>
              </div>
              <p className="suggestion-intro">Synthesizing constructive feedback using foundational reasoning models:</p>
              <div className="suggestion-body">
                {result.improvement_suggestion.split('\n').map((line, idx) => (
                  <p key={idx} className="suggestion-line">{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
