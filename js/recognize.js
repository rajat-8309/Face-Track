/* ================================================
   recognize.js — Full Auto Attendance
   1. Teacher selects branch + semester + subject
   2. Session starts, camera opens automatically
   3. Continuous scan marks Present in real-time
   4. End Session → all unseen = Absent
   5. Unknown faces logged per session
   No manual snap needed. No grace period.
   ================================================ */
const Rec = (() => {
  let _stream         = null;
  let _scanLoop       = null;
  let _running        = false;
  let _session        = null;
  let _matcher        = null;
  let _lastUnknown    = 0;
  const _debounced    = new Map();   // studentId → timestamp (debounce 5s)
  const _markedThisSession = new Set(); // studentIds confirmed Present — avoids per-scan DB calls
  let _cntPresent = 0, _cntUnknown = 0;

  // ── SETUP — called when session is started ────
  async function setup(session) {
    _session  = session;
    _matcher  = await FaceEngine.buildMatcherForGroup(session.branch, session.semester);
    _resetCounters();
    // Pre-load any students already marked Present (e.g. page refresh mid-session)
    // This means _doScan never needs a DB round-trip to check isMarkedForSession
    const existing = await DB.attendance.getBySession(session.id);
    existing.forEach(r => _markedThisSession.add(r.studentId));
    if (!_matcher) toast(`⚠ No students registered for ${session.branch} Sem ${session.semester}`, 'warn');
    _updateSessionBadge();
  }

  // ── CAMERA ────────────────────────────────────
  async function startCamera() {
    if (_stream) return;
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      $('recVideo').srcObject = _stream;
      await $('recVideo').play();
      setTag('recTag', '● LIVE', true);
      setScan('recScan', true);
      _setDot('green', 'SCANNING');
      _startScanLoop();
    } catch (err) {
      toast('Camera error: ' + err.message, 'error');
    }
  }

  function stopCamera() {
    _stopScanLoop();
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    setTag('recTag', 'CAMERA OFF', false);
    setScan('recScan', false);
    clearCanvas('recCanvas');
    _setDot('dim', 'IDLE');
  }

  // ── SCAN LOOP — runs every 1.5 seconds ────────
  function _startScanLoop() {
    if (_running) return;
    _running = true;
    const run = async () => {
      if (!_running || !_stream) return;
      await _doScan();
      if (_running) _scanLoop = setTimeout(run, 1500);
    };
    _scanLoop = setTimeout(run, 800);
  }

  function _stopScanLoop() {
    _running = false;
    clearTimeout(_scanLoop);
  }

  // ── CORE SCAN ─────────────────────────────────
  async function _doScan() {
    const video  = $('recVideo');
    const canvas = $('recCanvas');
    if (!video || !canvas || !_session) return;

    const result = await FaceEngine.recognizeWith(video, _matcher);
    FaceEngine.drawBoxes(canvas, video, result);

    if (!result || result.error || result.noFace) return;

    // ── UNRECOGNIZED FACE ─────────────────────
    if (!result.matched) {
      _showOverlay('Unknown', `dist: ${result.distance?.toFixed(3)}`, false);
      if (Date.now() - _lastUnknown > 8000) {
        _lastUnknown = Date.now();
        const snap   = captureFrame('recVideo', 0.7);
        await DB.unknownFaces.add({
          snap:      snap || '',
          sessionId: _session.id,
          branch:    _session.branch,
          semester:  _session.semester,
          date:      new Date().toLocaleDateString('en-CA'),
          time:      new Date().toLocaleTimeString(),
          timestamp: new Date().toISOString()
        });
        _cntUnknown++;
        _updateSummary();
        _addFeedItem('unknown', null, null);
        _refreshUnknownBadge();
      }
      return;
    }

    const student = result.student;
    _showOverlay(student.name, `${result.confPct}% · ${student.branch} Sem ${student.semester}`, true);

    // ── ALREADY MARKED (in-memory — no DB round-trip) ────
    if (_markedThisSession.has(student.studentId)) return;

    // ── DEBOUNCE (5 sec) ─────────────────────
    const last = _debounced.get(student.studentId);
    if (last && Date.now() - last < 5000) return;

    // ── MARK PRESENT ─────────────────────────
    const now = new Date();
    await DB.attendance.add({
      studentDbId: student.id,
      studentId:   student.studentId,
      name:        student.name,
      branch:      student.branch,
      semester:    student.semester,
      section:     student.section || '',
      subject:     _session.subject,
      sessionId:   _session.id,
      date:        now.toLocaleDateString('en-CA'),
      time:        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestamp:   now.toISOString(),
      status:      'Present',
      confidence:  result.confidence,
      distance:    parseFloat(result.distance.toFixed(4)),
      confPct:     result.confPct,
      liveSnap:    captureFrame('recVideo', 0.35) || '',  // low quality to save DB space
      autoMarked:  false
    });

    _markedThisSession.add(student.studentId); // prevent future DB lookups for this student

    _debounced.set(student.studentId, Date.now());
    _cntPresent++;
    _updateSummary();
    _addFeedItem('present', student, result);
    toast(`✓ ${student.name} — Present`, 'success');
  }

  // ── END SESSION ───────────────────────────────
  async function endSession() {
    if (!_session) return toast('No active session', 'warn');

    _stopScanLoop();
    stopCamera();

    try {
      const summary = await Session.end();
      _showEndSummary(summary);
      _session = null;
      _resetCounters();
      $('attSessionPanel').style.display = 'none';
      $('attSetupPanel').style.display   = 'block';
      $('btnEndSession').style.display   = 'none';
    } catch (err) {
      toast('Error ending session: ' + err.message, 'error');
    }
  }

  function _showEndSummary({ presentCount, absentCount, unknownCount, total }) {
    const el = $('recEndSummary');
    if (!el) return;
    el.innerHTML = `
      <div class="end-summary-card">
        <div class="es-title">Session Ended</div>
        <div class="es-stats">
          <div class="es-stat green"><div class="es-val">${presentCount}</div><div class="es-lbl">Present</div></div>
          <div class="es-stat red">  <div class="es-val">${absentCount}</div> <div class="es-lbl">Absent</div></div>
          <div class="es-stat orange"><div class="es-val">${unknownCount}</div><div class="es-lbl">Unknown</div></div>
          <div class="es-stat grey">  <div class="es-val">${total}</div>       <div class="es-lbl">Total Students</div></div>
        </div>
        <button class="btn accent" onclick="this.parentElement.parentElement.innerHTML=''">Dismiss</button>
      </div>`;
    el.style.display = 'block';
  }

  // ── FEED ──────────────────────────────────────
  function _addFeedItem(type, student, result) {
    const feed = $('recFeed');
    if (!feed) return;
    if (feed.querySelector('.empty')) feed.innerHTML = '';

    const el = document.createElement('div');
    el.className = `feed-item ${type}`;

    if (type === 'present') {
      const pct   = result?.confPct || 0;
      const color = pct >= 65 ? 'var(--green)' : pct >= 45 ? 'var(--yellow)' : 'var(--red)';
      el.innerHTML = `
        <img class="feed-thumb" src="${student?.photoThumb||''}" onerror="this.style.display='none'"/>
        <div class="feed-info">
          <div class="feed-name">${student.name}</div>
          <div class="feed-meta">${student.studentId} · ${student.branch} Sem ${student.semester}</div>
          <div class="conf-bar"><div class="conf-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span class="badge present">PRESENT</span>
          <div class="feed-time">${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="feed-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--surface3);border-radius:7px;font-size:1.3rem">?</div>
        <div class="feed-info">
          <div class="feed-name" style="color:var(--orange)">Unknown Face</div>
          <div class="feed-meta">Not in database for this group</div>
        </div>
        <span class="badge unknown">UNKNOWN</span>`;
    }

    feed.prepend(el);
    while (feed.children.length > 50) feed.removeChild(feed.lastChild);
  }

  function clearFeed() {
    const f = $('recFeed');
    if (f) f.innerHTML = '<p class="empty">Feed cleared.</p>';
  }

  // ── HELPERS ───────────────────────────────────
  function _updateSummary() {
    setText('sumPresent', _cntPresent);
    setText('sumUnknown', _cntUnknown);
  }

  function _updateSessionBadge() {
    if (!_session) return;
    setText('recSubjectBadge',  _session.subject);
    setText('recBranchBadge',   `${_session.branch} · Sem ${_session.semester}`);
  }

  function _showOverlay(name, detail, matched) {
    const overlay = $('recOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    setText('recName',   name);
    setText('recDetail', detail);
  }

  function _resetCounters() { _cntPresent = _cntUnknown = 0; _debounced.clear(); _markedThisSession.clear(); _updateSummary(); }

  function _setDot(state, label) {
    const dot  = $('recStatusDot');
    const text = $('recStatusText');
    const colors = { green: 'var(--green)', orange: 'var(--orange)', dim: 'var(--text-dim)' };
    if (dot)  { dot.style.background = colors[state] || colors.dim; dot.style.boxShadow = state !== 'dim' ? `0 0 6px ${colors[state]}` : 'none'; }
    if (text) text.textContent = label;
  }

  async function _refreshUnknownBadge() {
    const count = await DB.unknownFaces.count();
    const badge = document.getElementById('unknownBadge');
    if (badge) { badge.style.display = count > 0 ? 'inline' : 'none'; badge.textContent = count; }
  }

  function $(id) { return document.getElementById(id); }

  return { setup, startCamera, stopCamera, endSession, clearFeed };
})();
