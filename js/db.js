/* ================================================
   db.js — Supabase Cloud Backend
   Replaces IndexedDB with Supabase (PostgreSQL).
   Public API is identical to the IndexedDB version
   so no other files need to change.
   ================================================ */
const DB = (() => {
  let _sb = null;

  // ── Init ──────────────────────────────────────
  async function open() {
    if (typeof window.supabase === 'undefined')
      throw new Error('Supabase client not loaded. Check index.html script tags.');

    if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR_PROJECT'))
      throw new Error('Fill in your Supabase URL and anon key in js/config.js');

    _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

    // Connectivity test
    const { error } = await _sb.from('students').select('id').limit(1);
    if (error && error.code !== 'PGRST116')
      throw new Error('Cannot reach Supabase: ' + error.message);
  }

  // Throw on Supabase errors, otherwise return data
  function _ok({ data, error }) {
    if (error) throw error;
    return data;
  }

  // ── STUDENTS ──────────────────────────────────
  const students = {
    async add(s) {
      const res = await _sb.from('students').insert([s]).select('id').single();
      if (res.error) {
        if (res.error.code === '23505') {
          const e = new Error('Duplicate studentId'); e.name = 'ConstraintError'; throw e;
        }
        throw res.error;
      }
      return res.data.id;
    },

    async update(s) {
      const { id, ...fields } = s;
      const res = await _sb.from('students').update(fields).eq('id', id);
      if (res.error) throw res.error;
    },

    async getAll() {
      return _ok(await _sb.from('students').select('*')) || [];
    },

    async getById(id) {
      const res = await _sb.from('students').select('*').eq('id', id).maybeSingle();
      if (res.error) return null;
      return res.data || null;
    },

    async getByStudentId(sid) {
      const res = await _sb.from('students').select('*').eq('studentId', sid).maybeSingle();
      if (res.error) return null;
      return res.data || null;
    },

    async delete(id) {
      _ok(await _sb.from('students').delete().eq('id', id));
    },

    async clear() {
      // Delete all rows (neq id 0 matches everything)
      _ok(await _sb.from('students').delete().neq('id', 0));
    },

    async count() {
      const res = await _sb.from('students').select('*', { count: 'exact', head: true });
      if (res.error) throw res.error;
      return res.count || 0;
    },

    async getByBranch(branch) {
      return _ok(await _sb.from('students').select('*').eq('branch', branch)) || [];
    },

    async getByBranchSemester(branch, semester) {
      return _ok(await _sb
        .from('students').select('*')
        .eq('branch', branch)
        .eq('semester', parseInt(semester))
      ) || [];
    },

    async getAllBranches() {
      const data = _ok(await _sb.from('students').select('branch')) || [];
      return [...new Set(data.map(s => s.branch).filter(Boolean))].sort();
    },

    async getAllBranchSemesters() {
      const data = _ok(await _sb.from('students').select('branch, semester')) || [];
      const seen = new Set(); const out = [];
      for (const s of data) {
        const k = `${s.branch}||${s.semester}`;
        if (!seen.has(k)) { seen.add(k); out.push({ branch: s.branch, semester: Number(s.semester) }); }
      }
      return out.sort((a, b) => a.branch.localeCompare(b.branch) || a.semester - b.semester);
    }
  };

  // ── SESSIONS ──────────────────────────────────
  const sessions = {
    async add(s) {
      const res = await _sb.from('sessions').insert([s]).select('id').single();
      if (res.error) throw res.error;
      return res.data.id;
    },

    async update(s) {
      const { id, ...fields } = s;
      const res = await _sb.from('sessions').update(fields).eq('id', id);
      if (res.error) throw res.error;
    },

    async getAll() {
      return _ok(await _sb.from('sessions').select('*')) || [];
    },

    async getById(id) {
      const res = await _sb.from('sessions').select('*').eq('id', id).maybeSingle();
      if (res.error) return null;
      return res.data || null;
    },

    async delete(id) {
      _ok(await _sb.from('sessions').delete().eq('id', id));
    },

    async clear() {
      _ok(await _sb.from('sessions').delete().neq('id', 0));
    },

    async getActive() {
      return _ok(await _sb.from('sessions').select('*').eq('active', true)) || [];
    },

    async getByBranch(branch) {
      const data = _ok(await _sb.from('sessions').select('*').eq('branch', branch)) || [];
      return data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getByBranchSemester(branch, semester) {
      const data = _ok(await _sb
        .from('sessions').select('*')
        .eq('branch', branch)
        .eq('semester', parseInt(semester))
      ) || [];
      return data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getTodayByBranch(branch) {
      const today = new Date().toLocaleDateString('en-CA');
      return _ok(await _sb.from('sessions').select('*').eq('branch', branch).eq('date', today)) || [];
    }
  };

  // ── ATTENDANCE ────────────────────────────────
  const attendance = {
    async add(r) {
      const res = await _sb.from('attendance').insert([r]).select('id').single();
      if (res.error) throw res.error;
      return res.data.id;
    },

    async getAll() {
      return _ok(await _sb.from('attendance').select('*')) || [];
    },

    async getById(id) {
      const res = await _sb.from('attendance').select('*').eq('id', id).maybeSingle();
      if (res.error) return null;
      return res.data || null;
    },

    async getBySession(sessionId) {
      return _ok(await _sb.from('attendance').select('*').eq('sessionId', sessionId)) || [];
    },

    async getByBranch(branch) {
      return _ok(await _sb.from('attendance').select('*').eq('branch', branch)) || [];
    },

    async delete(id) {
      _ok(await _sb.from('attendance').delete().eq('id', id));
    },

    async clear() {
      _ok(await _sb.from('attendance').delete().neq('id', 0));
    },

    async isMarkedForSession(studentId, sessionId) {
      const res = await _sb
        .from('attendance').select('id')
        .eq('studentId', studentId)
        .eq('sessionId', sessionId)
        .limit(1);
      return (res.data || []).length > 0;
    },

    async getByBranchDateRange(branch, from, to) {
      const data = _ok(await _sb.from('attendance').select('*').eq('branch', branch)) || [];
      return data.filter(r => r.date >= from && r.date <= to);
    },

    async countPresentForSession(sessionId) {
      const res = await _sb
        .from('attendance').select('*', { count: 'exact', head: true })
        .eq('sessionId', sessionId).eq('status', 'Present');
      if (res.error) throw res.error;
      return res.count || 0;
    }
  };

  // ── UNKNOWN FACES ─────────────────────────────
  const unknownFaces = {
    async add(f) {
      const res = await _sb.from('unknownFaces').insert([f]).select('id').single();
      if (res.error) throw res.error;
      return res.data.id;
    },

    async getAll() {
      return _ok(await _sb.from('unknownFaces').select('*')) || [];
    },

    async getBySession(sessionId) {
      return _ok(await _sb.from('unknownFaces').select('*').eq('sessionId', sessionId)) || [];
    },

    async delete(id) {
      _ok(await _sb.from('unknownFaces').delete().eq('id', id));
    },

    async clear() {
      _ok(await _sb.from('unknownFaces').delete().neq('id', 0));
    },

    async count() {
      const res = await _sb.from('unknownFaces').select('*', { count: 'exact', head: true });
      if (res.error) throw res.error;
      return res.count || 0;
    }
  };

  // ── BRANCH AUTH ───────────────────────────────
  const branchAuth = {
    async set(branch, hash) {
      const res = await _sb.from('branchAuth').upsert([{ branch, hash }]);
      if (res.error) throw res.error;
    },

    async get(branch) {
      const res = await _sb.from('branchAuth').select('hash').eq('branch', branch).maybeSingle();
      return res.data?.hash || null;
    },

    async has(branch) {
      const res = await _sb.from('branchAuth').select('branch').eq('branch', branch).maybeSingle();
      return !!res.data;
    },

    async delete(branch) {
      _ok(await _sb.from('branchAuth').delete().eq('branch', branch));
    },

    async getAll() {
      return _ok(await _sb.from('branchAuth').select('*')) || [];
    }
  };

  return { open, students, sessions, attendance, unknownFaces, branchAuth };
})();
