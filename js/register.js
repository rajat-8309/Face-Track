/* ================================================
   register.js — Student Registration v3
   ================================================ */
const Reg = (() => {
  let _stream  = null;
  let _photos  = [];
  let _looping = false;

  async function startCam() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      const v = $('regVideo');
      v.srcObject = _stream;
      await v.play();
      setTag('regTag', '● LIVE', true);
      setScan('regScan', true);
      $('btnCapture').disabled = false;
      _detectionLoop();
    } catch (err) {
      toast('Camera error: ' + err.message, 'error');
    }
  }

  function stopCam() {
    _looping = false;
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    setTag('regTag', 'CAMERA OFF', false);
    setScan('regScan', false);
    $('btnCapture').disabled = true;
    clearCanvas('regCanvas');
  }

  async function _detectionLoop() {
    if (_looping) return;
    _looping = true;
    const video  = $('regVideo');
    const canvas = $('regCanvas');
    const status = $('regFaceStatus');
    while (_looping && _stream) {
      if (FaceEngine.ready) {
        try {
          const dets = await FaceEngine.detectAll(video);
          FaceEngine.drawBoxes(canvas, video,
            dets.length ? { allBoxes: dets.map(d => d.detection.box), matched: false } : null
          );
          _setStatus(status,
            dets.length ? `✓ ${dets.length} face(s) detected` : 'No face detected — position yourself in frame',
            dets.length ? 'ok' : 'warn'
          );
        } catch (_) {}
      }
      await _sleep(600);
    }
    _looping = false;
  }

  async function capturePhoto() {
    if (!_stream)            return toast('Start camera first', 'warn');
    if (_photos.length >= 5) return toast('Maximum 5 photos captured', 'warn');
    if (!FaceEngine.ready)   return toast('Models loading…', 'warn');

    const det = await FaceEngine.captureDescriptor($('regVideo'));
    if (!det) {
      _setStatus($('regFaceStatus'), '✗ No face detected — move closer', 'err');
      return toast('No face detected', 'error');
    }

    const dataUrl = captureFrame('regVideo');
    if (!dataUrl) return;
    _photos.push({ dataUrl, descriptor: det.descriptor });

    const slot = $('ph' + (_photos.length - 1));
    if (slot) { slot.classList.add('filled'); slot.innerHTML = `<img src="${dataUrl}"/>`; }
    _setStatus($('regFaceStatus'), `✓ Photo ${_photos.length}/5 captured`, 'ok');
    toast(`Photo ${_photos.length} captured!`, 'success');
    if (_photos.length >= 5) $('btnCapture').disabled = true;
  }

  async function saveStudent() {
    const name     = $('rName').value.trim();
    const sid      = $('rId').value.trim();
    const branch   = $('rBranch').value;
    const semester = $('rSemester').value;

    if (!name)           return showBanner('regBanner', 'error', '⚠ Full name is required.');
    if (!sid)            return showBanner('regBanner', 'error', '⚠ Enrollment / Roll number is required.');
    if (!branch)         return showBanner('regBanner', 'error', '⚠ Branch is required.');
    if (!semester)       return showBanner('regBanner', 'error', '⚠ Semester is required.');
    if (!_photos.length) return showBanner('regBanner', 'error', '⚠ Capture at least 1 face photo.');

    setBtnLoading('btnRegSave', 'Checking face…');
    hideBanner('regBanner');

    try {
      // ── DUPLICATE FACE CHECK ────────────────────────────────────
      // Compare every captured descriptor against every existing student.
      // Blocks registration if the same face is already in the database.
      const newDescriptors = _photos.map(p => p.descriptor);
      const duplicate = await _checkDuplicateFace(newDescriptors);
      if (duplicate) {
        return showBanner('regBanner', 'error',
          `⚠ This face already belongs to <strong>${duplicate.name}</strong> ` +
          `(${duplicate.studentId} · ${duplicate.branch} Sem ${duplicate.semester}).<br>` +
          `Registering the same face under a different ID is not allowed.`);
      }

      setBtnLoading('btnRegSave', 'Saving…');
      await DB.students.add({
        name, studentId: sid, branch,
        semester:    parseInt(semester),
        section:     $('rSection').value.trim(),
        email:       $('rEmail').value.trim(),
        phone:       $('rPhone').value.trim(),
        guardian:    $('rGuardian').value.trim(),
        descriptors: newDescriptors,
        photoThumb:  _photos[0].dataUrl,
        registeredAt: new Date().toISOString()
      });
      await FaceEngine.buildMatcher();

      // Clear form first, THEN show banner so it stays visible
      clearForm();
      showBanner('regBanner', 'success',
        `✓ <strong>${name}</strong> registered successfully.<br>Branch: <strong>${branch}</strong> · Semester <strong>${semester}</strong>`);
      toast(`${name} registered!`, 'success');

    } catch (err) {
      if (err.name === 'ConstraintError')
        showBanner('regBanner', 'error', `⚠ Enrollment ID "<strong>${sid}</strong>" already exists. Use a different ID.`);
      else
        showBanner('regBanner', 'error', '✗ Save failed: ' + err.message);
      console.error('[Reg.saveStudent]', err);
    } finally {
      setBtnDone('btnRegSave');
    }
  }

  // Compare new descriptors against all existing students.
  // Returns the matching student, or null if the face is genuinely new.
  async function _checkDuplicateFace(newDescriptors) {
    if (typeof faceapi === 'undefined') return null;
    const all = await DB.students.getAll();
    for (const student of all) {
      if (!student.descriptors?.length) continue;
      for (const newDescArr of newDescriptors) {
        const newDesc = new Float32Array(newDescArr);
        for (const storedDescArr of student.descriptors) {
          const storedDesc = new Float32Array(storedDescArr);
          // 0.45 is tighter than the recognition threshold (0.50) to catch fraud
          if (faceapi.euclideanDistance(newDesc, storedDesc) < 0.45) return student;
        }
      }
    }
    return null;
  }

  // NOTE: clearForm hides the banner so it can be used by the Clear button safely.
  // saveStudent re-shows the banner AFTER calling clearForm.
  function clearForm() {
    ['rName','rId','rEmail','rPhone','rGuardian','rSection'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    $('rBranch').value = ''; $('rSemester').value = '';
    _photos = [];
    for (let i = 0; i < 5; i++) {
      const s = $('ph' + i);
      if (s) { s.className = 'ph-slot'; s.innerHTML = `<span>${i+1}</span>`; }
    }
    $('btnCapture').disabled = !_stream;
    hideBanner('regBanner');
    const st = $('regFaceStatus'); if (st) { st.textContent = ''; st.className = 'face-status'; }
  }

  function $(id) { return document.getElementById(id); }
  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function _setStatus(el, msg, cls) {
    if (!el) return; el.textContent = msg;
    el.className = 'face-status' + (cls ? ' ' + cls : '');
  }

  return { startCam, stopCam, capturePhoto, saveStudent, clearForm };
})();
