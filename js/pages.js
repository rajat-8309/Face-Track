/* pages.js v3 */
const Dashboard = (() => {
  async function load() {
    const branches = await DB.students.getAllBranches();
    const grid = document.getElementById('branchGrid');
    if (!grid) return;
    if (!branches.length) {
      grid.innerHTML = '<div class="empty-state"><div class="es-icon">🎓</div><div class="es-title">No students registered yet</div><div class="es-sub">Register students to see branches here.</div><button class="btn accent" onclick="goPage(\'register\')" style="margin-top:16px">Register First Student</button></div>';
      return;
    }
    const today = new Date().toLocaleDateString('en-CA');
    const allSess = await DB.sessions.getAll();
    const allStudents = await DB.students.getAll();
    grid.innerHTML = '';
    for (const branch of branches) {
      const branchStudents = allStudents.filter(s => s.branch === branch);
      const todaySessions = allSess.filter(s => s.branch === branch && s.date === today);
      const activeSessions = todaySessions.filter(s => s.active);
      const hasPwd = await Auth.hasPassword(branch);
      const isLoggedIn = Auth.isLoggedIn(branch);
      let todayPresent = 0;
      for (const s of todaySessions) todayPresent += s.totalPresent || 0;
      const icons = {'Computer':'💻','Information':'🖥️','Electronics':'⚡','Electrical':'⚡','Mechanical':'⚙️','Civil':'🏗️','Chemical':'🧪','Artificial':'🤖','Automobile':'🚗'};
      let icon = '📚';
      for (const k of Object.keys(icons)) { if (branch.includes(k)) { icon = icons[k]; break; } }
      const card = document.createElement('div');
      card.className = 'branch-card';
      const safeBranch = branch.replace(/'/g, "\\'");
      card.innerHTML = '<div class="bc-header"><div class="bc-icon">'+icon+'</div><div class="bc-lock">'+(hasPwd?'🔐':'🔓')+'</div></div><div class="bc-name">'+branch+'</div><div class="bc-stats"><div class="bc-stat"><span class="bc-val">'+branchStudents.length+'</span><span class="bc-lbl">Students</span></div><div class="bc-stat"><span class="bc-val">'+todaySessions.length+'</span><span class="bc-lbl">Classes Today</span></div><div class="bc-stat"><span class="bc-val">'+todayPresent+'</span><span class="bc-lbl">Present Today</span></div></div>'+(activeSessions.length?'<div class="bc-live-badge">● '+activeSessions.length+' LIVE</div>':'')+'<div class="bc-actions"><button class="btn accent sm" onclick="BranchPortal.open(\''+safeBranch+'\')">'+((isLoggedIn)?'📊 View Portal':(hasPwd?'🔐 Login & View':'📊 Open Portal'))+'</button></div>';
      grid.appendChild(card);
    }
  }
  return { load };
})();

const BranchPortal = (() => {
  let _branch = '';
  let _activeTab = 'sessions';

  async function open(branch) {
    _branch = branch;
    Auth.requireLogin(branch, async () => {
      goPage('portal');
      setText('portalBranchName', branch);
      setText('portalBranchTitle', branch + ' — Branch Portal');
      await _renderSemesters();
      await showTab('sessions');
    });
  }

  async function _renderSemesters() {
    const pairs = await DB.students.getAllBranchSemesters();
    const sems = pairs.filter(p => p.branch === _branch).map(p => p.semester).sort((a,b)=>a-b);
    const box = document.getElementById('portalSemesterFilter');
    if (!box) return;
    box.innerHTML = '<option value="">All Semesters</option>' + sems.map(s => '<option value="'+s+'">Semester '+s+'</option>').join('');
  }

  async function showTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.portal-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('portalSessions').style.display = tab === 'sessions' ? 'block' : 'none';
    document.getElementById('portalStudents').style.display = tab === 'students' ? 'block' : 'none';
    if (tab === 'sessions') await _loadSessions();
    if (tab === 'students') await _loadStudents();
  }

  async function _loadSessions() {
    const semFilter = document.getElementById('portalSemesterFilter')?.value || '';
    let sessions = await DB.sessions.getByBranch(_branch);
    if (semFilter) sessions = sessions.filter(s => String(s.semester) === semFilter);
    const box = document.getElementById('portalSessionList');
    if (!box) return;
    if (!sessions.length) { box.innerHTML = '<p class="empty">No sessions recorded yet.</p>'; return; }

    const allStudents = await DB.students.getAll();

    // Group sessions by date, newest date first
    const byDate = new Map();
    for (const s of sessions) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    const today     = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');

    function _dateLabel(d) {
      if (d === today)     return { label: 'Today',     full: new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) };
      if (d === yesterday) return { label: 'Yesterday', full: new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) };
      return { label: new Date(d).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'}), full: new Date(d).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) };
    }

    let html = '';
    for (const date of sortedDates) {
      const dateSessions = byDate.get(date);
      const { label, full } = _dateLabel(date);
      html += '<div class="session-date-group">';
      html += '<div class="session-date-header">' +
        '<span class="sdh-label">' + label + '</span>' +
        '<span class="sdh-full">' + full + '</span>' +
        '<span class="sdh-count">' + dateSessions.length + ' session' + (dateSessions.length !== 1 ? 's' : '') + '</span>' +
        '</div>';

      for (const s of dateSessions) {
        const total    = allStudents.filter(st => st.branch === _branch && String(st.semester) === String(s.semester)).length;
        const present  = s.totalPresent || 0;
        const absent   = s.totalAbsent  || 0;
        const pct      = total > 0 ? Math.round(present / total * 100) : 0;
        const barColor = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
        html += '<div class="session-row ' + (s.active ? 'session-row-live' : '') + '" onclick="BranchPortal.viewSession(' + s.id + ')" style="position:relative">' +
          '<div class="sr-left">' +
            '<div class="sr-subject">' + s.subject + (s.active ? ' <span class="live-dot">●</span>' : '') + '</div>' +
            '<div class="sr-meta">Sem ' + s.semester + (s.timeSlot ? ' · <strong>' + s.timeSlot + '</strong>' : '') + ' · ' + s.startTime + (s.endTime ? '–' + s.endTime : ' (ongoing)') + '</div>' +
          '</div>' +
          '<div class="sr-right">' +
            '<div class="sr-counts"><span style="color:var(--green)">✓ ' + present + '</span> <span style="color:var(--red)">✗ ' + absent + '</span> <span style="color:var(--text-muted)">/ ' + total + '</span></div>' +
            '<div class="sr-bar-wrap"><div class="sr-bar" style="width:' + pct + '%;background:' + barColor + '"></div></div>' +
            '<div class="sr-pct">' + pct + '%</div>' +
          '</div>' +
          '<div class="sr-arrow">›</div>' +
          '<button class="btn xs danger" style="margin-left:8px;flex-shrink:0" onclick="event.stopPropagation();BranchPortal.deleteSession(' + s.id + ')">🗑</button>' +
        '</div>';
      }
      html += '</div>';
    }
    box.innerHTML = html;
  }

  async function viewSession(sessionId) {
    const sess = await DB.sessions.getById(sessionId);
    if (!sess) return;
    const recs = await DB.attendance.getBySession(sessionId);
    const unknowns = await DB.unknownFaces.getBySession(sessionId);
    const students = await DB.students.getByBranchSemester(sess.branch, sess.semester);
    const present = recs.filter(r => r.status === 'Present');
    const absent = recs.filter(r => r.status === 'Absent');
    const pct = students.length > 0 ? Math.round(present.length / students.length * 100) : 0;
    const box = document.getElementById('portalSessionDetail');
    if (!box) return;
    box.innerHTML = '<div class="detail-header"><button class="btn ghost sm" onclick="BranchPortal.backToSessions()">← Back</button><div><h3 style="font-size:1.1rem;font-weight:700">'+sess.subject+'</h3><p style="font-size:.75rem;color:var(--text-muted)">'+sess.branch+' · Sem '+sess.semester+' · '+sess.date+' · '+sess.startTime+(sess.endTime?'–'+sess.endTime:'')+'</p></div><button class="btn sm outline" onclick="BranchPortal.exportSessionCSV('+sessionId+')">⬇ CSV</button></div><div class="detail-kpis"><div class="dk green"><div class="dk-val">'+present.length+'</div><div class="dk-lbl">Present</div></div><div class="dk red"><div class="dk-val">'+absent.length+'</div><div class="dk-lbl">Absent</div></div><div class="dk orange"><div class="dk-val">'+unknowns.length+'</div><div class="dk-lbl">Unknown</div></div><div class="dk grey"><div class="dk-val">'+pct+'%</div><div class="dk-lbl">Attendance</div></div></div><div class="detail-sections"><div class="detail-col"><div class="detail-col-title" style="color:var(--green)">✓ Present ('+present.length+')</div>'+(present.length?present.map(r=>'<div class="att-row"><img class="att-thumb" src="'+(r.liveSnap||'')+'" onerror="this.style.display=\'none\'"/><div><div class="att-name">'+r.name+'</div><div class="att-id">'+r.studentId+'</div></div><div style="margin-left:auto;text-align:right"><span class="badge present">PRESENT</span><div class="att-time">'+r.time+'</div></div></div>').join(''):'<p class="empty">No students marked present.</p>')+'</div><div class="detail-col"><div class="detail-col-title" style="color:var(--red)">✗ Absent ('+absent.length+')</div>'+(absent.length?absent.map(r=>'<div class="att-row"><div class="att-thumb-ph">'+r.name[0]+'</div><div><div class="att-name">'+r.name+'</div><div class="att-id">'+r.studentId+'</div></div><span class="badge absent" style="margin-left:auto">ABSENT</span></div>').join(''):'<p class="empty">No absences.</p>')+(unknowns.length?'<div class="detail-col-title" style="margin-top:16px;color:var(--orange)">? Unknown ('+unknowns.length+')</div><div class="unknown-snaps">'+unknowns.map(u=>u.snap?'<img class="unk-snap" src="'+u.snap+'" title="'+u.time+'"/>':'').join('')+'</div>':'')+'</div></div>';
    document.getElementById('portalSessionList').style.display = 'none';
    document.getElementById('portalSessionDetail').style.display = 'block';
  }

  function backToSessions() {
    document.getElementById('portalSessionList').style.display = 'block';
    document.getElementById('portalSessionDetail').style.display = 'none';
  }

  async function exportSessionCSV(sessionId) {
    const sess = await DB.sessions.getById(sessionId);
    const recs = await DB.attendance.getBySession(sessionId);
    const header = 'Name,Student ID,Branch,Semester,Subject,Date,Time,Status\n';
    const rows = recs.map(r => '"'+r.name+'","'+r.studentId+'","'+(r.branch||'')+'",'+r.semester+',"'+(r.subject||'')+'",'+r.date+','+r.time+','+r.status).join('\n');
    downloadBlob(new Blob([header+rows],{type:'text/csv'}), (sess.subject||'session')+'_'+sess.date+'.csv');
  }

  async function _loadStudents() {
    const semFilter = document.getElementById('portalSemesterFilter')?.value || '';
    let students = await DB.students.getByBranch(_branch);
    if (semFilter) students = students.filter(s => String(s.semester) === semFilter);
    const allAtt = await DB.attendance.getByBranch(_branch);
    const box = document.getElementById('portalStudentList');
    if (!box) return;
    if (!students.length) { box.innerHTML = '<p class="empty">No students in this branch.</p>'; return; }
    box.innerHTML = students.map(s => {
      const recs = allAtt.filter(r => r.studentId === s.studentId);
      const present = recs.filter(r => r.status === 'Present').length;
      const absent = recs.filter(r => r.status === 'Absent').length;
      const total = present + absent;
      const pct = total ? Math.round(present / total * 100) : 0;
      const risk = pct < 75 ? 'low' : pct < 85 ? 'medium' : 'high';
      return '<div class="portal-stu-row" style="cursor:pointer" onclick="BranchPortal.viewStudent('+s.id+')">'+(s.photoThumb?'<img class="portal-stu-avatar" src="'+s.photoThumb+'" onerror="this.style.display=\'none\'"/>':"<div class='portal-stu-avatar' style='background:var(--accent-g);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800'>"+s.name[0]+'</div>')+'<div class="portal-stu-info"><div class="portal-stu-name">'+s.name+'</div><div class="portal-stu-meta">'+s.studentId+' · Sem '+s.semester+(s.section?' · '+s.section:'')+'</div></div><div class="portal-stu-att"><div class="portal-att-nums"><span style="color:var(--green)">✓'+present+'</span> <span style="color:var(--red)">✗'+absent+'</span></div><span class="badge '+risk+'">'+pct+'%</span></div><div style="color:var(--text-dim);padding-left:8px">›</div></div>';
    }).join('');
  }

  async function viewStudent(dbId) {
    const s = await DB.students.getById(dbId);
    if (!s) return;
    const allAtt   = await DB.attendance.getAll();
    const recs     = allAtt.filter(r => r.studentId === s.studentId);
    const present  = recs.filter(r => r.status === 'Present').length;
    const absent   = recs.filter(r => r.status === 'Absent').length;
    const total    = present + absent;
    const pct      = total ? Math.round(present / total * 100) : 0;
    const pctColor = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';

    // Last 5 sessions this student attended
    const recentPresent = recs
      .filter(r => r.status === 'Present')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);

    const modal   = document.getElementById('stuDetailModal');
    const content = document.getElementById('stuDetailContent');
    if (!modal || !content) return;

    const avatar = s.photoThumb
      ? '<img class="stu-detail-photo" src="' + s.photoThumb + '" onerror="this.className=\'stu-detail-initials\';this.textContent=\'' + (s.name[0]||'?') + '\'"/>'
      : '<div class="stu-detail-initials">' + (s.name[0]||'?') + '</div>';

    const infoRow = (lbl, val) => val
      ? '<div class="stu-info-row"><span class="stu-info-lbl">' + lbl + '</span><span>' + val + '</span></div>'
      : '';

    const regDate = s.registeredAt
      ? new Date(s.registeredAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
      : '—';

    content.innerHTML =
      '<div class="stu-detail-header">' +
        avatar +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:1.15rem;font-weight:800;margin-bottom:4px">' + s.name + '</div>' +
          '<div style="font-family:var(--mono);font-size:.75rem;color:var(--text-muted);margin-bottom:8px">' + s.studentId + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<span class="badge info">' + s.branch + '</span>' +
            '<span class="badge skip">Sem ' + s.semester + '</span>' +
            (s.section ? '<span class="badge skip">Div ' + s.section + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<button class="stu-detail-close" onclick="document.getElementById(\'stuDetailModal\').style.display=\'none\'">✕</button>' +
      '</div>' +
      '<div class="stu-detail-body">' +
        '<div class="stu-detail-kpis">' +
          '<div class="sdk" style="border-top:3px solid var(--green)">' +
            '<div class="sdk-val" style="color:var(--green)">' + present + '</div>' +
            '<div class="sdk-lbl">Present</div>' +
          '</div>' +
          '<div class="sdk" style="border-top:3px solid var(--red)">' +
            '<div class="sdk-val" style="color:var(--red)">' + absent + '</div>' +
            '<div class="sdk-lbl">Absent</div>' +
          '</div>' +
          '<div class="sdk" style="border-top:3px solid ' + pctColor + '">' +
            '<div class="sdk-val" style="color:' + pctColor + '">' + pct + '%</div>' +
            '<div class="sdk-lbl">Attendance</div>' +
          '</div>' +
        '</div>' +
        '<div class="stu-detail-section">' +
          '<div class="stu-detail-section-title">Personal Information</div>' +
          infoRow('Email', s.email) +
          infoRow('Phone', s.phone) +
          infoRow('Guardian', s.guardian) +
          infoRow('Registered', regDate) +
          (!s.email && !s.phone && !s.guardian
            ? '<div style="font-size:.78rem;color:var(--text-dim)">No contact information provided.</div>'
            : '') +
        '</div>' +
        (recentPresent.length
          ? '<div class="stu-detail-section">' +
              '<div class="stu-detail-section-title">Recent Attendance (last 5 present)</div>' +
              recentPresent.map(r =>
                '<div class="stu-info-row">' +
                  '<span class="stu-info-lbl">' + r.date + '</span>' +
                  '<span style="flex:1">' + r.subject + '</span>' +
                  '<span style="font-family:var(--mono);font-size:.65rem;color:var(--text-muted)">' + r.time + '</span>' +
                '</div>'
              ).join('') +
            '</div>'
          : '') +
      '</div>';

    modal.style.display = 'flex';
  }

  async function deleteSession(sessionId) {
    const sess = await DB.sessions.getById(sessionId);
    if (!sess) return;
    _confirmWithPassword({
      branch:   sess.branch,
      icon:     '🗑️',
      title:    'Delete Session',
      message:  `Delete "${sess.subject}" (${sess.date}${sess.timeSlot ? ' · ' + sess.timeSlot : ''})? All attendance records for this session will be permanently removed.`,
      btnLabel: 'Delete Session',
      onConfirm: async () => {
        try {
          const recs     = await DB.attendance.getBySession(sessionId);
          const unknowns = await DB.unknownFaces.getBySession(sessionId);
          await Promise.all(recs.map(r => DB.attendance.delete(r.id)));
          await Promise.all(unknowns.map(u => DB.unknownFaces.delete(u.id)));
          await DB.sessions.delete(sessionId);
          toast('Session deleted', 'warn');
          await _loadSessions();
        } catch (err) {
          toast('Error deleting session: ' + err.message, 'error');
        }
      }
    });
  }

  function logout() {
    Auth.logout(_branch);
    goPage('dashboard');
    toast('Logged out of ' + _branch, 'info');
  }

  function filterChanged() {
    if (_activeTab === 'sessions') _loadSessions();
    else _loadStudents();
  }

  return { open, showTab, viewSession, viewStudent, deleteSession, backToSessions, exportSessionCSV, logout, filterChanged };
})();

const AttendPage = (() => {
  async function init() {
    const branches = await DB.students.getAllBranches();
    const branchEl = document.getElementById('attBranch');
    if (!branchEl) return;
    branchEl.innerHTML = '<option value="">— Select Branch —</option>' + branches.map(b => '<option value="'+b+'">'+b+'</option>').join('');
    await _updateSemesterOptions();
    const active = await Session.loadCurrent();
    if (active) _showActiveSession(active);
  }

  async function branchChanged() { await _updateSemesterOptions(); }

  async function _updateSemesterOptions() {
    const branch = document.getElementById('attBranch')?.value || '';
    const semEl = document.getElementById('attSemester');
    if (!semEl) return;
    const pairs = await DB.students.getAllBranchSemesters();
    const sems = pairs.filter(p => !branch || p.branch === branch).map(p => p.semester).sort((a,b)=>a-b);
    semEl.innerHTML = '<option value="">— Semester —</option>' + sems.map(s => '<option value="'+s+'">Semester '+s+'</option>').join('');
  }

  async function startSession() {
    const branch   = document.getElementById('attBranch')?.value;
    const semester = document.getElementById('attSemester')?.value;
    const subject  = document.getElementById('attSubject')?.value?.trim();
    const timeSlot = document.getElementById('attTimeSlot')?.value?.trim() || '';

    if (!branch)   return showBanner('attBanner','error','⚠ Select a branch.');
    if (!semester) return showBanner('attBanner','error','⚠ Select a semester.');
    if (!subject)  return showBanner('attBanner','error','⚠ Enter the subject / class name.');

    // Always verify the branch password — never rely on an existing portal
    // login session, so students cannot start a session themselves.
    _confirmWithPassword({
      branch,
      icon:     '🔐',
      title:    'Start Attendance Session',
      message:  `Enter the ${branch} password to begin marking attendance for Semester ${semester}.`,
      btnLabel: 'Start Session',
      btnClass: 'accent',
      onConfirm: async () => {
        const btn = document.getElementById('btnStartSession');
        btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Starting…';
        try {
          const session = await Session.start(branch, semester, subject, timeSlot);
          await Rec.setup(session);
          hideBanner('attBanner');
          _showActiveSession(session);
          await Rec.startCamera();
        } catch(err) {
          showBanner('attBanner','error','✗ '+err.message);
        } finally {
          btn.disabled = false; btn.textContent = '▶ Start Session';
        }
      }
    });
  }

  function _showActiveSession(session) {
    document.getElementById('attSetupPanel').style.display = 'none';
    document.getElementById('attSessionPanel').style.display = 'block';
    document.getElementById('btnEndSession').style.display = 'inline-flex';
    setText('attActiveBranch', session.branch);
    setText('attActiveSemester', 'Semester ' + session.semester);
    setText('attActiveSubject', session.subject);
    setText('attActiveStart', session.startTime);
  }

  async function endSession() {
    const btn = document.getElementById('btnEndSession');
    btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Ending…';
    await Rec.endSession();
    btn.disabled = false; btn.textContent = '⏹ End Session';
    document.getElementById('attSetupPanel').style.display = 'block';
    document.getElementById('attSessionPanel').style.display = 'none';
    btn.style.display = 'none';
  }

  return { init, branchChanged, startSession, endSession };
})();

// ── SHARED: confirm an action with branch password ────────────────────────
function _confirmWithPassword({ branch, icon = '⚠️', title, message, btnLabel = 'Confirm', btnClass = 'danger', onConfirm }) {
  const modal    = document.getElementById('confirmModal');
  const iconEl   = document.getElementById('confirmModalIcon');
  const titleEl  = document.getElementById('confirmModalTitle');
  const msgEl    = document.getElementById('confirmModalMsg');
  const passEl   = document.getElementById('confirmModalPass');
  const errEl    = document.getElementById('confirmModalErr');
  const submitEl = document.getElementById('confirmModalSubmit');
  const closeEl  = document.getElementById('confirmModalClose');

  iconEl.textContent    = icon;
  titleEl.textContent   = title;
  msgEl.textContent     = message;
  submitEl.textContent  = btnLabel;
  submitEl.className    = 'btn ' + btnClass;
  passEl.value          = '';
  errEl.textContent     = '';
  modal.style.display   = 'flex';
  setTimeout(() => passEl.focus(), 50);

  const attempt = async () => {
    const pwd = passEl.value.trim();
    const hasPwd = await Auth.hasPassword(branch);
    if (!hasPwd) { modal.style.display = 'none'; onConfirm(); return; }
    if (!pwd) { errEl.textContent = 'Enter the branch password.'; return; }
    submitEl.disabled = true; submitEl.innerHTML = '<div class="spin"></div>';
    const valid = await Auth.verifyPassword(branch, pwd);
    submitEl.disabled = false; submitEl.textContent = btnLabel;
    if (!valid) { errEl.textContent = '✗ Incorrect password.'; passEl.value = ''; passEl.focus(); return; }
    modal.style.display = 'none';
    onConfirm();
  };

  submitEl.onclick = attempt;
  passEl.onkeydown = e => { if (e.key === 'Enter') attempt(); };
  closeEl.onclick  = () => { modal.style.display = 'none'; };
}

const StudentsPage = (() => {
  async function load() {
    // FIX: wrap entire function in try/catch so errors surface instead of
    // silently leaving the grid stuck on "No students registered."
    try {
      const all = await DB.students.getAll();
      const search = (document.getElementById('studentSearch')?.value || '').toLowerCase();

      // Read filter values BEFORE rebuilding the dropdown
      const branch = document.getElementById('studentBranchFilter')?.value || '';
      const sem    = document.getElementById('studentSemFilter')?.value    || '';

      let list = all;
      if (search) list = list.filter(s =>
        s.name.toLowerCase().includes(search) || s.studentId.toLowerCase().includes(search));
      if (branch) list = list.filter(s => s.branch === branch);
      if (sem)    list = list.filter(s => String(s.semester) === sem);

      // Rebuild branch dropdown, then explicitly restore the selected value.
      // FIX: setting innerHTML alone doesn't guarantee the browser picks the
      // "selected" option — assigning .value afterwards is required.
      const branchEl = document.getElementById('studentBranchFilter');
      if (branchEl) {
        const branches = [...new Set(all.map(s => s.branch).filter(Boolean))].sort();
        branchEl.innerHTML = '<option value="">All Branches</option>' +
          branches.map(b => '<option value="' + b + '">' + b + '</option>').join('');
        branchEl.value = branch; // FIX: explicitly restore selection after innerHTML reset
      }

      const el = document.getElementById('studentsCount');
      if (el) el.textContent = list.length + ' of ' + all.length + ' students';

      const grid = document.getElementById('studentsGrid');
      if (!grid) return;

      if (!list.length) {
        grid.innerHTML = all.length
          ? '<p class="empty">No students match the current filters.</p>'
          : '<p class="empty">No students registered yet.</p>';
        return;
      }

      grid.innerHTML = list.map(s => {
        const avatar = s.photoThumb
          ? '<img class="stu-avatar" src="' + s.photoThumb + '" onerror="this.style.display=\'none\'"/>'
          : "<div class='stu-avatar stu-initials'>" + (s.name[0] || '?') + '</div>';
        const safeName = (s.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return (
          '<div class="stu-card">' +
            '<div class="stu-card-top">' +
              avatar +
              '<div>' +
                '<div class="stu-name">' + (s.name || '—') + '</div>' +
                '<div class="stu-id">'  + (s.studentId || '—') + '</div>' +
                '<div style="display:flex;gap:4px;margin-top:4px">' +
                  '<span class="badge info" style="font-size:.55rem">' + (s.branch || '') + '</span>' +
                  '<span class="badge skip" style="font-size:.55rem">Sem ' + s.semester + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="stu-actions">' +
              '<button class="btn xs outline" onclick="StudentsPage.edit(' + s.id + ')">✏️ Edit</button>' +
              '<button class="btn xs danger"  onclick="StudentsPage.remove(' + s.id + ',\'' + safeName + '\',\'' + (s.branch||'').replace(/'/g,"\\'") + '\')">🗑 Delete</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

    } catch (err) {
      // FIX: surface errors so the developer can see what went wrong
      console.error('[StudentsPage.load]', err);
      const grid = document.getElementById('studentsGrid');
      if (grid) grid.innerHTML = '<p class="empty" style="color:var(--red)">Failed to load students: ' + err.message + '</p>';
      toast('Error loading students: ' + err.message, 'error');
    }
  }

  async function remove(id, name, branch) {
    _confirmWithPassword({
      branch,
      icon: '🗑️',
      title: 'Delete Student',
      message: `Permanently delete "${name}" and all their attendance records? This cannot be undone.`,
      btnLabel: 'Delete Student',
      onConfirm: async () => {
        try {
          await DB.students.delete(id);
          const all = await DB.attendance.getAll();
          await Promise.all(all.filter(r => r.studentDbId === id).map(r => DB.attendance.delete(r.id)));
          await FaceEngine.buildMatcher();
          toast(name + ' deleted', 'warn');
          load();
        } catch (err) {
          console.error('[StudentsPage.remove]', err);
          toast('Error deleting student: ' + err.message, 'error');
        }
      }
    });
  }

  async function edit(id) {
    try {
      const s = await DB.students.getById(id);
      if (!s) return toast('Student not found', 'error');
      document.getElementById('editStudentDbId').value  = id;
      document.getElementById('editName').value         = s.name        || '';
      document.getElementById('editId').value           = s.studentId   || '';
      document.getElementById('editBranch').value       = s.branch      || '';
      document.getElementById('editSemester').value     = s.semester    || '';
      document.getElementById('editSection').value      = s.section     || '';
      document.getElementById('editEmail').value        = s.email       || '';
      document.getElementById('editPhone').value        = s.phone       || '';
      document.getElementById('editGuardian').value     = s.guardian    || '';
      document.getElementById('editAuthPass').value     = '';
      const banner = document.getElementById('editBanner');
      if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
      document.getElementById('editStudentModal').style.display = 'flex';
    } catch (err) {
      toast('Error loading student: ' + err.message, 'error');
    }
  }

  async function saveEdit() {
    const dbId     = parseInt(document.getElementById('editStudentDbId').value);
    const name     = document.getElementById('editName').value.trim();
    const sid      = document.getElementById('editId').value.trim();
    const branch   = document.getElementById('editBranch').value;
    const semester = document.getElementById('editSemester').value;
    const password = document.getElementById('editAuthPass').value.trim();

    const showErr = msg => {
      const b = document.getElementById('editBanner');
      if (b) { b.className = 'banner error'; b.innerHTML = msg; b.style.display = 'block'; }
    };

    if (!name)     return showErr('⚠ Full name is required.');
    if (!sid)      return showErr('⚠ Enrollment ID is required.');
    if (!branch)   return showErr('⚠ Branch is required.');
    if (!semester) return showErr('⚠ Semester is required.');
    if (!password) return showErr('⚠ Enter the branch password to save changes.');

    const btn = document.getElementById('btnEditSave');
    btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Saving…';

    try {
      const valid = await Auth.verifyPassword(branch, password);
      if (!valid) { btn.disabled = false; btn.textContent = 'Save Changes'; return showErr('✗ Incorrect branch password.'); }

      const s = await DB.students.getById(dbId);
      if (!s) throw new Error('Student record not found.');

      s.name     = name;
      s.studentId = sid;
      s.branch   = branch;
      s.semester  = parseInt(semester);
      s.section  = document.getElementById('editSection').value.trim();
      s.email    = document.getElementById('editEmail').value.trim();
      s.phone    = document.getElementById('editPhone').value.trim();
      s.guardian = document.getElementById('editGuardian').value.trim();

      await DB.students.update(s);
      await FaceEngine.buildMatcher();
      document.getElementById('editStudentModal').style.display = 'none';
      toast(name + ' updated successfully', 'success');
      load();
    } catch (err) {
      if (err.name === 'ConstraintError')
        showErr('⚠ Enrollment ID "' + sid + '" is already used by another student.');
      else
        showErr('✗ ' + err.message);
      console.error('[StudentsPage.saveEdit]', err);
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  }

  return { load, remove, edit, saveEdit };
})();

const Settings = (() => {
  async function load() {
    const branches = await DB.students.getAllBranches();
    const box = document.getElementById('branchPasswordList');
    if (!box) return;
    if (!branches.length) { box.innerHTML = '<p class="empty">No branches yet.</p>'; return; }
    const authList = await DB.branchAuth.getAll();
    const authMap  = new Map(authList.map(a => [a.branch, true]));

    box.innerHTML = branches.map(branch => {
      const safeId     = branch.replace(/[^a-zA-Z0-9]/g, '_');
      const safeBranch = branch.replace(/'/g, "\\'");
      const hasPwd     = authMap.has(branch);

      if (hasPwd) {
        // Branch has password — require current password to change or remove
        return (
          '<div class="pwd-row" style="flex-direction:column;align-items:stretch;gap:10px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
              '<div><div style="font-weight:600;font-size:.88rem">' + branch + '</div>' +
              '<div style="font-size:.72rem;color:var(--text-muted)">🔐 Password set</div></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
              '<input type="password" class="finput" id="curPwd_' + safeId + '" placeholder="Current password"/>' +
              '<input type="password" class="finput" id="newPwd_' + safeId + '" placeholder="New password (min. 4 chars)"/>' +
            '</div>' +
            '<div style="display:flex;gap:8px">' +
              '<button class="btn sm accent" style="flex:1" onclick="Settings.changePassword(\'' + safeBranch + '\')">🔑 Change Password</button>' +
              '<button class="btn sm danger" onclick="Settings.removePassword(\'' + safeBranch + '\')">🔓 Remove</button>' +
            '</div>' +
          '</div>'
        );
      } else {
        // No password — just set a new one
        return (
          '<div class="pwd-row">' +
            '<div><div style="font-weight:600;font-size:.88rem">' + branch + '</div>' +
            '<div style="font-size:.72rem;color:var(--text-muted)">🔓 Open access</div></div>' +
            '<div style="display:flex;gap:8px;align-items:center">' +
              '<input type="password" class="finput" id="newPwd_' + safeId + '" placeholder="Set a password…" style="width:160px"/>' +
              '<button class="btn sm accent" onclick="Settings.setPassword(\'' + safeBranch + '\')">Set</button>' +
            '</div>' +
          '</div>'
        );
      }
    }).join('');
  }

  // No existing password — just set it
  async function setPassword(branch) {
    const safeId = branch.replace(/[^a-zA-Z0-9]/g, '_');
    const newEl  = document.getElementById('newPwd_' + safeId);
    const newPwd = newEl?.value?.trim();
    if (!newPwd) return toast('Enter a password first', 'warn');
    try {
      await Auth.setPassword(branch, newPwd);
      if (newEl) newEl.value = '';
      toast('Password set for ' + branch, 'success');
      await load();
    } catch(err) { toast(err.message, 'error'); }
  }

  // Existing password — require current password before changing
  async function changePassword(branch) {
    const safeId = branch.replace(/[^a-zA-Z0-9]/g, '_');
    const curEl  = document.getElementById('curPwd_' + safeId);
    const newEl  = document.getElementById('newPwd_' + safeId);
    const curPwd = curEl?.value?.trim();
    const newPwd = newEl?.value?.trim();
    if (!curPwd) return toast('Enter your current password', 'warn');
    if (!newPwd) return toast('Enter the new password', 'warn');
    try {
      await Auth.changePassword(branch, curPwd, newPwd);
      if (curEl) curEl.value = '';
      if (newEl) newEl.value = '';
      toast('Password changed for ' + branch, 'success');
      await load();
    } catch(err) { toast(err.message, 'error'); }
  }

  // Require current password before removing
  async function removePassword(branch) {
    const safeId = branch.replace(/[^a-zA-Z0-9]/g, '_');
    const curEl  = document.getElementById('curPwd_' + safeId);
    const curPwd = curEl?.value?.trim();
    if (!curPwd) return toast('Enter the current password to remove it', 'warn');
    const valid = await Auth.verifyPassword(branch, curPwd);
    if (!valid) return toast('✗ Incorrect current password', 'error');
    if (!confirm('Remove password for "' + branch + '"? It will become open access.')) return;
    await Auth.removePassword(branch);
    toast('Password removed for ' + branch, 'warn');
    await load();
  }

  function updateThresh(v) {
    document.getElementById('threshLabel').textContent = parseFloat(v).toFixed(2);
    FaceEngine.setThreshold(parseFloat(v)); FaceEngine.buildMatcher();
  }

  function updateFaceConf(v) {
    document.getElementById('faceConfLabel').textContent = parseFloat(v).toFixed(2);
    FaceEngine.setMinFaceConf(parseFloat(v));
  }

  async function exportBackup() {
    const students = await DB.students.getAll();
    const attendance = await DB.attendance.getAll();
    const sessions = await DB.sessions.getAll();
    downloadBlob(new Blob([JSON.stringify({students,attendance,sessions},null,2)],{type:'application/json'}),'facetrack_backup_'+new Date().toLocaleDateString('en-CA')+'.json');
    toast('Backup exported!','success');
  }

  async function clearAttendance() {
    if (!confirm('Clear ALL attendance records?')) return;
    await DB.attendance.clear(); await DB.unknownFaces.clear();
    toast('Cleared','warn');
  }

  async function wipeAll() {
    if (!confirm('Wipe ALL data?')) return;
    if (!confirm('Final confirmation?')) return;
    await Promise.all([DB.students.clear(),DB.sessions.clear(),DB.attendance.clear(),DB.unknownFaces.clear()]);
    await FaceEngine.buildMatcher(); toast('All data wiped','error');
  }

  return { load, setPassword, changePassword, removePassword, updateThresh, updateFaceConf, exportBackup, clearAttendance, wipeAll };
})();

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

async function exportCSV() {
  const records = await DB.attendance.getAll();
  if (!records.length) return toast('No records to export','warn');
  const header = 'Name,Student ID,Branch,Semester,Subject,Date,Time,Status\n';
  const rows = records.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(r=>'"'+r.name+'","'+r.studentId+'","'+(r.branch||'')+'",'+r.semester+',"'+(r.subject||'')+'",'+r.date+','+r.time+','+r.status).join('\n');
  downloadBlob(new Blob([header+rows],{type:'text/csv'}),'attendance_'+new Date().toLocaleDateString('en-CA')+'.csv');
  toast('CSV exported!','success');
}
