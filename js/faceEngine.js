/* ================================================
   faceEngine.js — Face Detection & Recognition
   ================================================ */
const FaceEngine = (() => {
  const MODEL_URL  = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
  let _ready       = false;
  let _matcher     = null;
  let _threshold   = 0.50;
  let _minFaceConf = 0.70;

  async function loadModels(onProgress) {
    let tries = 0;
    while (typeof faceapi === 'undefined' && tries++ < 60) await _sleep(200);
    if (typeof faceapi === 'undefined') throw new Error('face-api.js failed to load');

    onProgress?.(20);
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    onProgress?.(55);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    onProgress?.(88);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    onProgress?.(100);
    _ready = true;
  }

  async function buildMatcher() {
    const all = await DB.students.getAll();
    _matcher  = _makeMatcher(all);
    return all.length;
  }

  async function buildMatcherForGroup(branch, semester) {
    const students = await DB.students.getByBranchSemester(branch, semester);
    return students.length ? _makeMatcher(students) : null;
  }

  function _makeMatcher(students) {
    const labeled = [];
    for (const s of students) {
      if (!s.descriptors?.length) continue;
      labeled.push(new faceapi.LabeledFaceDescriptors(
        String(s.id),
        s.descriptors.map(d => new Float32Array(d))
      ));
    }
    if (!labeled.length) return null;
    return new faceapi.FaceMatcher(labeled, _threshold);
  }

  function _opts() {
    return new faceapi.SsdMobilenetv1Options({ minConfidence: _minFaceConf });
  }

  async function detectAll(el) {
    if (!_ready) return [];
    return faceapi.detectAllFaces(el, _opts()).withFaceLandmarks().withFaceDescriptors();
  }

  async function detectSingle(el) {
    if (!_ready) return null;
    return faceapi.detectSingleFace(el, _opts()).withFaceLandmarks().withFaceDescriptor();
  }

  async function recognizeWith(videoEl, matcher) {
    if (!_ready)  return { error: 'Models not loaded' };
    if (!matcher) return { error: 'No students registered for this group' };

    const dets = await detectAll(videoEl);
    if (!dets.length) return { noFace: true };

    const best  = dets.reduce((a, b) => a.detection.box.area > b.detection.box.area ? a : b);
    const match = matcher.findBestMatch(best.descriptor);
    const dist  = match.distance;

    if (match.label === 'unknown' || dist > _threshold) {
      return { matched: false, distance: dist, box: best.detection.box, allBoxes: dets.map(d => d.detection.box) };
    }

    const student = await DB.students.getById(parseInt(match.label));
    if (!student) return { matched: false, distance: dist };

    return {
      matched:    true,
      student,
      distance:   dist,
      confidence: dist < 0.35 ? 'HIGH' : dist < 0.50 ? 'MEDIUM' : 'LOW',
      confPct:    Math.round((1 - dist) * 100),
      box:        best.detection.box,
      allBoxes:   dets.map(d => d.detection.box)
    };
  }

  function drawBoxes(canvas, video, result) {
    const ctx = canvas.getContext('2d');
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!result || result.error || result.noFace) return;

    const boxes = result.allBoxes || (result.box ? [result.box] : []);
    const color = result.matched ? '#22c55e' : '#f97316';

    for (const b of boxes) {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      const cs = 14;
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      [[b.x,b.y,1,1],[b.x+b.width,b.y,-1,1],[b.x,b.y+b.height,1,-1],[b.x+b.width,b.y+b.height,-1,-1]]
      .forEach(([x,y,dx,dy]) => {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dx*cs,y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+dy*cs); ctx.stroke();
      });
      if (result.matched && result.student) {
        const lbl = `${result.student.name}  ${result.confPct}%`;
        ctx.font = 'bold 13px JetBrains Mono,monospace';
        const tw  = ctx.measureText(lbl).width;
        ctx.fillStyle = color; ctx.fillRect(b.x, b.y - 26, tw + 16, 24);
        ctx.fillStyle = '#000'; ctx.fillText(lbl, b.x + 8, b.y - 9);
      }
    }
  }

  async function captureDescriptor(el) {
    if (!_ready) throw new Error('Models not loaded');
    const d = await detectSingle(el);
    if (!d) return null;
    return { descriptor: Array.from(d.descriptor), box: d.detection.box };
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  return {
    loadModels, buildMatcher, buildMatcherForGroup,
    detectAll, detectSingle, recognizeWith, drawBoxes, captureDescriptor,
    setThreshold:   t => { _threshold   = t; },
    setMinFaceConf: c => { _minFaceConf = c; },
    get ready()   { return _ready; },
    get matcher() { return _matcher; }
  };
})();
