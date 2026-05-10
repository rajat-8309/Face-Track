/* ================================================
   auth.js — Branch-Level Authentication
   Passwords stored as SHA-256 hashes in IndexedDB.
   Login sessions stored in sessionStorage (8h TTL).
   One branch head → one branch only.
   ================================================ */
const Auth = (() => {
  const PREFIX   = 'ftauth_';
  const TTL      = 8 * 60 * 60 * 1000; // 8 hours

  // ── SHA-256 hash ──────────────────────────────
  async function _hash(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── Set / change branch password ──────────────
  async function setPassword(branch, password) {
    if (!password || password.length < 4)
      throw new Error('Password must be at least 4 characters.');
    const hash = await _hash(password);
    await DB.branchAuth.set(branch, hash);
  }

  // ── Remove branch password ────────────────────
  async function removePassword(branch) {
    await DB.branchAuth.delete(branch);
    sessionStorage.removeItem(PREFIX + branch);
  }

  // ── Check if branch has a password set ────────
  async function hasPassword(branch) {
    return DB.branchAuth.has(branch);
  }

  // ── Verify password without creating a session ────
  async function verifyPassword(branch, password) {
    const stored = await DB.branchAuth.get(branch);
    if (!stored) return true; // No password set = open access
    const hash = await _hash(password);
    return hash === stored;
  }

  // ── Change password — requires old password first ──
  async function changePassword(branch, oldPassword, newPassword) {
    const valid = await verifyPassword(branch, oldPassword);
    if (!valid) throw new Error('Current password is incorrect.');
    await setPassword(branch, newPassword);
  }

  // ── Verify password and create session ────────
  async function login(branch, password) {
    const stored = await DB.branchAuth.get(branch);
    if (!stored) {
      // No password set → auto-login (open branch)
      _createSession(branch);
      return true;
    }
    const hash = await _hash(password);
    if (hash !== stored) return false;
    _createSession(branch);
    return true;
  }

  function _createSession(branch) {
    sessionStorage.setItem(PREFIX + branch, Date.now().toString());
  }

  // ── Check if currently logged in ──────────────
  function isLoggedIn(branch) {
    const val = sessionStorage.getItem(PREFIX + branch);
    if (!val) return false;
    if (Date.now() - parseInt(val) > TTL) {
      sessionStorage.removeItem(PREFIX + branch);
      return false;
    }
    return true;
  }

  // ── Logout ────────────────────────────────────
  function logout(branch) {
    sessionStorage.removeItem(PREFIX + branch);
  }

  // ── Require login: show modal or call cb ──────
  async function requireLogin(branch, onSuccess) {
    if (isLoggedIn(branch)) { onSuccess(); return; }

    const hasPwd = await hasPassword(branch);
    if (!hasPwd) {
      // No password configured → open access
      _createSession(branch);
      onSuccess();
      return;
    }

    // Show login modal
    _showModal(branch, onSuccess);
  }

  function _showModal(branch, onSuccess) {
    const modal   = document.getElementById('authModal');
    const title   = document.getElementById('authModalTitle');
    const passEl  = document.getElementById('authModalPass');
    const errEl   = document.getElementById('authModalErr');
    const submitEl= document.getElementById('authModalSubmit');

    title.textContent = `🔐 ${branch}`;
    passEl.value      = '';
    errEl.textContent = '';
    modal.style.display = 'flex';
    passEl.focus();

    const attempt = async () => {
      const pwd = passEl.value.trim();
      if (!pwd) { errEl.textContent = 'Enter the branch password.'; return; }

      submitEl.disabled  = true;
      submitEl.innerHTML = '<div class="spin"></div>';
      const ok = await login(branch, pwd);
      submitEl.disabled  = false;
      submitEl.textContent = 'Login';

      if (ok) {
        modal.style.display = 'none';
        onSuccess();
      } else {
        errEl.textContent = '✗ Incorrect password.';
        passEl.value = '';
        passEl.focus();
      }
    };

    submitEl.onclick = attempt;
    passEl.onkeydown = e => { if (e.key === 'Enter') attempt(); };
    document.getElementById('authModalClose').onclick = () => { modal.style.display = 'none'; };
  }

  return { setPassword, removePassword, hasPassword, verifyPassword, changePassword, login, logout, isLoggedIn, requireLogin };
})();
