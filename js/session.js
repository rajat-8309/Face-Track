/* ================================================
   session.js — Simplified Session Management
   No grace period. No timetable.
   Teacher selects: branch · semester · subject
   System auto-marks Present (camera) + Absent (end)
   ================================================ */
const Session = (() => {
  let _current = null;

  function _dateStr() { return new Date().toLocaleDateString('en-CA'); }
  function _timeStr() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  // ── START ─────────────────────────────────────
  async function start(branch, semester, subject, timeSlot = '') {
    if (!branch || !semester || !subject)
      throw new Error('Branch, semester and subject are required.');

    // Check for duplicate active session for this group
    const active = await DB.sessions.getActive();
    const dup    = active.find(s => s.branch === branch && String(s.semester) === String(semester));
    if (dup) throw new Error(`A session is already active for ${branch} Sem ${semester}: "${dup.subject}"`);

    const session = {
      branch,
      semester:    parseInt(semester),
      subject:     subject.trim(),
      timeSlot:    timeSlot.trim(),
      date:        _dateStr(),
      startTime:   _timeStr(),
      endTime:     null,
      active:      true,
      totalPresent:  0,
      totalAbsent:   0,
      totalUnknown:  0,
      createdAt:   new Date().toISOString()
    };

    const id   = await DB.sessions.add(session);
    session.id = id;
    _current   = session;
    console.log(`[Session] Started: ${subject} | ${branch} Sem ${semester}`);
    return session;
  }

  // ── END — marks all unseen students as Absent ─
  async function end() {
    let sess = _current;
    if (!sess) {
      // Try to recover from DB in case of page refresh
      const active = await DB.sessions.getActive();
      if (!active.length) throw new Error('No active session.');
      sess = active[0];
    }

    const students  = await DB.students.getByBranchSemester(sess.branch, sess.semester);
    const sessRecs  = await DB.attendance.getBySession(sess.id);
    const markedIds = new Set(sessRecs.map(r => r.studentId));
    const unknowns  = await DB.unknownFaces.getBySession(sess.id);

    let absentCount = 0;
    for (const s of students) {
      if (markedIds.has(s.studentId)) continue;
      await DB.attendance.add({
        studentDbId: s.id,
        studentId:   s.studentId,
        name:        s.name,
        branch:      s.branch,
        semester:    s.semester,
        section:     s.section || '',
        subject:     sess.subject,
        sessionId:   sess.id,
        date:        sess.date,
        time:        _timeStr(),
        timestamp:   new Date().toISOString(),
        status:      'Absent',
        confidence:  'N/A',
        distance:    null,
        confPct:     0,
        autoMarked:  true
      });
      absentCount++;
    }

    const presentCount = sessRecs.filter(r => r.status === 'Present').length;

    sess.active        = false;
    sess.endTime       = _timeStr();
    sess.totalPresent  = presentCount;
    sess.totalAbsent   = absentCount;
    sess.totalUnknown  = unknowns.length;
    await DB.sessions.update(sess);

    _current = null;
    return { presentCount, absentCount, unknownCount: unknowns.length, total: students.length };
  }

  // ── GETTERS ───────────────────────────────────
  function getCurrent()        { return _current; }

  async function getActive()   {
    const list = await DB.sessions.getActive();
    return list.length ? list[0] : null;
  }

  async function loadCurrent() {
    const active = await DB.sessions.getActive();
    _current = active.length ? active[0] : null;
    return _current;
  }

  return { start, end, getCurrent, getActive, loadCurrent };
})();
