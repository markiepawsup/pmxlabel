/* Pharmax – เพิ่มข้อมูลยาใหม่ผ่านหน้าเว็บ (login / สมัคร / ส่งข้อมูลให้แอดมินตรวจ)
 * ใช้คู่กับ Code.gs (Apps Script Web App)  —  วางไฟล์นี้ไว้โฟลเดอร์เดียวกับ index.html */
(function () {
  'use strict';

  // ⬇⬇⬇ ใส่ URL ของ Web App (ลงท้ายด้วย /exec) หลัง Deploy Apps Script ⬇⬇⬇
  const WEB_APP_URL = '';

  const $ = (s, r) => (r || document).querySelector(s);
  const SESSION_KEY = 'pharmax_submit_session';
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}

  // ---------- API ----------
  async function api(payload) {
    if (!WEB_APP_URL) return { ok: false, message: 'ยังไม่ได้ตั้งค่า WEB_APP_URL ใน drug-submit.js' };
    try {
      // ใช้ text/plain เพื่อไม่ให้เบราว์เซอร์ส่ง preflight (Apps Script ไม่รองรับ OPTIONS)
      const res = await fetch(WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      return await res.json();
    } catch (e) {
      return { ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' };
    }
  }
  const auth = () => ({ empId: session.empId, pin: session.pin });

  // ---------- validation ----------
  function pinError(pin) {
    if (!/^\d{4}$/.test(pin)) return 'รหัสผ่านต้องเป็นตัวเลข 4 หลัก';
    const d = pin.split('').map(Number);
    if (d.every(x => x === d[0])) return 'รหัสผ่านห้ามเป็นเลขซ้ำกันทั้งหมด (เช่น 1111)';
    if (d.every((x, i) => !i || x === d[i - 1] + 1) || d.every((x, i) => !i || x === d[i - 1] - 1)) return 'รหัสผ่านห้ามเป็นเลขเรียงกัน (เช่น 1234 หรือ 4321)';
    return '';
  }
  const onlyDigits = (el, max) => el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, max); });

  // ---------- UI shell ----------
  const css = `
  .dsm-fab{position:fixed;right:18px;bottom:18px;z-index:9000;background:#04B085;color:#fff;border:none;border-radius:999px;padding:12px 18px;font:700 .9rem inherit;font-family:inherit;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
  .dsm-fab:hover{filter:brightness(.93)}
  .dsm-overlay{position:fixed;inset:0;background:rgba(10,25,50,.55);z-index:9500;display:none;align-items:center;justify-content:center;padding:12px}
  .dsm-overlay.open{display:flex}
  .dsm-modal{background:#fff;border-radius:14px;width:100%;max-width:560px;max-height:92vh;overflow:auto;padding:18px 20px 20px;box-shadow:0 10px 40px rgba(0,0,0,.35);font-family:inherit;color:#222}
  .dsm-modal h3{margin:0 0 12px;color:#16478E;font-size:1.05rem;display:flex;justify-content:space-between;align-items:center}
  .dsm-x{background:none;border:none;font-size:1.4rem;cursor:pointer;color:#777}
  .dsm-modal label{display:block;font-weight:600;font-size:.78rem;margin:10px 0 3px}
  .dsm-modal input,.dsm-modal select,.dsm-modal textarea{width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:6px;font:inherit;font-size:.88rem;box-sizing:border-box}
  .dsm-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .dsm-grid4 label{margin-top:0;font-size:.72rem;text-align:center}
  .dsm-btn{margin-top:14px;width:100%;padding:10px;border:none;border-radius:8px;background:#16478E;color:#fff;font:700 .92rem inherit;cursor:pointer}
  .dsm-btn.sec{background:#fff;color:#16478E;border:2px solid #16478E}
  .dsm-btn:disabled{opacity:.55;cursor:wait}
  .dsm-msg{margin-top:10px;padding:9px 11px;border-radius:8px;font-size:.85rem;line-height:1.4}
  .dsm-msg.err{background:#fdecea;color:#b3261e}.dsm-msg.ok{background:#e6f6ee;color:#1a7a3a}.dsm-msg.warn{background:#fff6dd;color:#7a5b00}
  .dsm-hint{font-size:.72rem;color:#666;font-weight:400}
  .dsm-link{background:none;border:none;color:#16478E;text-decoration:underline;cursor:pointer;font:inherit;font-size:.82rem;padding:0;margin-top:10px}
  .dsm-who{font-size:.78rem;color:#555;margin-bottom:6px}
  #dsm_generic{text-transform:uppercase}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'dsm-fab'; fab.type = 'button'; fab.textContent = '➕ เพิ่มข้อมูลยาใหม่';
  const overlay = document.createElement('div');
  overlay.className = 'dsm-overlay';
  overlay.innerHTML = '<div class="dsm-modal" role="dialog" aria-modal="true"><div id="dsm_body"></div></div>';
  document.body.appendChild(fab); document.body.appendChild(overlay);
  const body = () => $('#dsm_body', overlay);

  const open = () => { overlay.classList.add('open'); session ? viewForm() : viewLogin(); };
  const close = () => overlay.classList.remove('open');
  fab.addEventListener('click', open);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  const head = t => '<h3><span>' + t + '</span><button class="dsm-x" type="button" data-close>×</button></h3>';
  overlay.addEventListener('click', e => { if (e.target.hasAttribute('data-close')) close(); });
  const msg = (cls, text) => '<div class="dsm-msg ' + cls + '">' + text + '</div>';
  const setMsg = (cls, text) => { $('#dsm_m').innerHTML = text ? msg(cls, text) : ''; };

  // ---------- views ----------
  function viewLogin(note) {
    body().innerHTML = head('🔐 เข้าสู่ระบบ') +
      '<label>รหัสพนักงาน (9 หลัก)</label><input id="dsm_emp" inputmode="numeric" autocomplete="off" placeholder="000000000">' +
      '<label>รหัสผ่าน (ตัวเลข 4 หลัก)</label><input id="dsm_pin" type="password" inputmode="numeric" autocomplete="off" placeholder="••••">' +
      '<div id="dsm_m">' + (note || '') + '</div>' +
      '<button class="dsm-btn" id="dsm_go" type="button">เข้าสู่ระบบ</button>' +
      '<button class="dsm-link" id="dsm_reg" type="button">ยังไม่มีบัญชี? สมัครใช้งาน</button>';
    onlyDigits($('#dsm_emp'), 9); onlyDigits($('#dsm_pin'), 4);
    $('#dsm_reg').onclick = viewRegister;
    $('#dsm_pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#dsm_go').click(); });
    $('#dsm_go').onclick = async () => {
      const empId = $('#dsm_emp').value, pin = $('#dsm_pin').value;
      if (!/^\d{9}$/.test(empId)) return setMsg('err', 'รหัสพนักงานต้องเป็นตัวเลข 9 หลัก');
      if (!/^\d{4}$/.test(pin)) return setMsg('err', 'รหัสผ่านต้องเป็นตัวเลข 4 หลัก');
      const b = $('#dsm_go'); b.disabled = true; b.textContent = 'กำลังตรวจสอบ…';
      const r = await api({ action: 'login', empId, pin });
      b.disabled = false; b.textContent = 'เข้าสู่ระบบ';
      if (!r.ok) return setMsg(r.error === 'pending' ? 'warn' : 'err', r.message || 'เข้าสู่ระบบไม่สำเร็จ');
      session = { empId: r.empId, pin, name: r.name };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      viewForm();
    };
  }

  function viewRegister() {
    body().innerHTML = head('📝 สมัครใช้งาน') +
      '<label>รหัสพนักงาน (9 หลัก)</label><input id="dsm_emp" inputmode="numeric" autocomplete="off">' +
      '<label>ตั้งรหัสผ่าน (ตัวเลข 4 หลัก ไม่เรียงกัน) <span class="dsm-hint">เช่น 2580, 1379 — ห้าม 1234 / 4321 / 1111</span></label><input id="dsm_pin" type="password" inputmode="numeric" autocomplete="off">' +
      '<label>ยืนยันรหัสผ่านอีกครั้ง</label><input id="dsm_pin2" type="password" inputmode="numeric" autocomplete="off">' +
      '<div id="dsm_m"></div>' +
      '<button class="dsm-btn" id="dsm_go" type="button">ส่งคำขอสมัคร</button>' +
      '<button class="dsm-link" id="dsm_back" type="button">← กลับไปเข้าสู่ระบบ</button>';
    onlyDigits($('#dsm_emp'), 9); onlyDigits($('#dsm_pin'), 4); onlyDigits($('#dsm_pin2'), 4);
    $('#dsm_back').onclick = () => viewLogin();
    $('#dsm_go').onclick = async () => {
      const empId = $('#dsm_emp').value, pin = $('#dsm_pin').value;
      if (!/^\d{9}$/.test(empId)) return setMsg('err', 'รหัสพนักงานต้องเป็นตัวเลข 9 หลัก');
      const pe = pinError(pin); if (pe) return setMsg('err', pe);
      if (pin !== $('#dsm_pin2').value) return setMsg('err', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      const b = $('#dsm_go'); b.disabled = true; b.textContent = 'กำลังส่ง…';
      const r = await api({ action: 'register', empId, pin });
      b.disabled = false; b.textContent = 'ส่งคำขอสมัคร';
      if (!r.ok) return setMsg('err', r.message || 'สมัครไม่สำเร็จ');
      body().innerHTML = head('✅ ส่งคำขอสมัครแล้ว') +
        msg('ok', 'กรุณารอแอดมินตรวจสอบข้อมูล แล้วกลับมาเข้าสู่ระบบภายหลัง') +
        '<button class="dsm-btn" data-close type="button">ตกลง</button>';
    };
  }

  function typeOptions() {
    const sel = document.getElementById('sel_drug_type');
    if (!sel) return '<option value="เม็ด">เม็ด</option>';
    return Array.from(sel.options).map(o => {
      const th = o.textContent.replace(/\s*\(.*\)\s*$/, '').trim();   // เก็บเฉพาะข้อความไทย ให้ตรงกับรูปแบบในชีท
      return '<option value="' + th + '">' + o.textContent + '</option>';
    }).join('');
  }
  function mealOptions() {
    const sel = document.getElementById('sel_meal');
    if (!sel) return '<option value="">-- ไม่ระบุ --</option>';
    return Array.from(sel.options).map(o => {
      const th = o.value ? o.textContent.replace(/\s*\(.*\)\s*$/, '').trim() : '';
      return '<option value="' + th + '">' + o.textContent + '</option>';
    }).join('');
  }

  function viewForm() {
    body().innerHTML = head('💊 เพิ่มข้อมูลยาใหม่') +
      '<div class="dsm-who">ผู้ใช้: <b>' + (session.name || '-') + '</b> (' + session.empId + ') · <button class="dsm-link" id="dsm_out" type="button" style="margin:0">ออกจากระบบ</button></div>' +
      '<label>บาร์โค้ด <span class="dsm-hint">ยิงเครื่องสแกนได้เลย</span></label><input id="dsm_bc" inputmode="numeric" autocomplete="off">' +
      '<label>Item No. (7 หลัก)</label><input id="dsm_item" inputmode="numeric" autocomplete="off" maxlength="7">' +
      '<div id="dsm_dup"></div>' +
      '<div id="dsm_rest">' +
      '<label>ชื่อการค้า</label><input id="dsm_trade" autocomplete="off">' +
      '<label>ชื่อยาสามัญ <span class="dsm-hint">(พิมพ์ใหญ่อัตโนมัติ)</span></label><input id="dsm_generic" autocomplete="off">' +
      '<label>ชนิดยา</label><select id="dsm_type">' + typeOptions() + '</select>' +
      '<label>สรรพคุณ</label><textarea id="dsm_ind" rows="2"></textarea>' +
      '<label>วิธีกิน — เวลาที่ใช้ยา</label><select id="dsm_meal">' + mealOptions() + '</select>' +
      '<label>วิธีกิน — ปริมาณแต่ละมื้อ <span class="dsm-hint">เช่น 1 เม็ด (เว้นว่างถ้าไม่ใช้)</span></label>' +
      '<div class="dsm-grid4"><div><label>เช้า</label><input id="dsm_m1"></div><div><label>กลางวัน</label><input id="dsm_m2"></div><div><label>เย็น</label><input id="dsm_m3"></div><div><label>ก่อนนอน</label><input id="dsm_m4"></div></div>' +
      '<label>คำแนะนำเพิ่มเติม</label><textarea id="dsm_adv" rows="2"></textarea>' +
      '<div id="dsm_m"></div>' +
      '<button class="dsm-btn" id="dsm_submit" type="button">Submit</button>' +
      '</div>';
    onlyDigits($('#dsm_bc'), 14); onlyDigits($('#dsm_item'), 7);
    $('#dsm_generic').addEventListener('input', e => {
      const el = e.target, p = el.selectionStart; el.value = el.value.toUpperCase(); try { el.setSelectionRange(p, p); } catch (x) {}
    });
    $('#dsm_out').onclick = () => { session = null; sessionStorage.removeItem(SESSION_KEY); viewLogin(); };
    $('#dsm_bc').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#dsm_item').focus(); } });
    $('#dsm_bc').addEventListener('change', checkDup);
    $('#dsm_item').addEventListener('change', checkDup);
    $('#dsm_submit').onclick = submit;
    setTimeout(() => $('#dsm_bc').focus(), 50);
  }

  // ตรวจซ้ำ: เช็คในแคชของแอปก่อน (เร็ว) แล้วเช็คกับเซิร์ฟเวอร์ (ครอบคลุมรายการที่รอตรวจ)
  async function checkDup() {
    const bc = $('#dsm_bc').value, item = $('#dsm_item').value;
    if (bc.length < 8) return false;
    let hit = null;
    try { if (typeof PharmaxSheet !== 'undefined') hit = PharmaxSheet.findByCode(bc); } catch (e) {}
    if (!hit) {
      const r = await api(Object.assign({ action: 'checkBarcode', barcodeNo: bc, itemNo: item }, auth()));
      if (r.ok && r.duplicate) hit = { name: r.drugName || '' };
    }
    if (hit) { showDuplicate(bc, hit.name); return true; }
    $('#dsm_dup').innerHTML = ''; $('#dsm_rest').style.display = '';
    return false;
  }

  function showDuplicate(bc, name) {
    $('#dsm_rest').style.display = 'none';
    $('#dsm_dup').innerHTML =
      msg('warn', '⚠️ <b>บาร์โค้ดนี้มีข้อมูลอยู่ในระบบแล้ว' + (name ? ' (' + name + ')' : '') + '</b><br>ไม่อนุญาตให้เพิ่มข้อมูลซ้ำ — หากต้องการแก้ไข กรุณาระบุรายละเอียดด้านล่าง เพื่อให้แอดมินตรวจสอบ') +
      '<label>ต้องการให้แก้ไขข้อมูลเป็นอย่างไร</label><textarea id="dsm_cmt" rows="3"></textarea>' +
      '<div id="dsm_m"></div><button class="dsm-btn sec" id="dsm_sendc" type="button">ส่งคำขอแก้ไข</button>';
    $('#dsm_sendc').onclick = async () => {
      const c = $('#dsm_cmt').value.trim();
      if (!c) return setMsg('err', 'กรุณาระบุรายละเอียดที่ต้องการแก้ไข');
      const b = $('#dsm_sendc'); b.disabled = true;
      const r = await api(Object.assign({ action: 'submitEdit', barcodeNo: bc, comment: c }, auth()));
      b.disabled = false;
      if (!r.ok) return setMsg('err', r.message || 'ส่งไม่สำเร็จ');
      done('✅ ส่งคำขอแก้ไขแล้ว', 'แอดมินจะตรวจสอบข้อมูลภายหลัง');
    };
  }

  async function submit() {
    const v = id => $('#' + id).value.trim();
    const drug = {
      barcodeNo: v('dsm_bc'), itemNo: v('dsm_item'), tradeName: v('dsm_trade'), genericName: v('dsm_generic').toUpperCase(),
      drugType: v('dsm_type'), meal: v('dsm_meal'), indication: v('dsm_ind'), advice: v('dsm_adv'),
      morning: v('dsm_m1'), noon: v('dsm_m2'), evening: v('dsm_m3'), bed: v('dsm_m4')
    };
    if (!/^\d{8,14}$/.test(drug.barcodeNo)) return setMsg('err', 'บาร์โค้ดต้องเป็นตัวเลข 8-14 หลัก');
    if (!/^\d{7}$/.test(drug.itemNo)) return setMsg('err', 'Item No. ต้องเป็นตัวเลข 7 หลัก');
    if (!drug.tradeName || !drug.genericName) return setMsg('err', 'กรุณากรอกชื่อการค้าและชื่อยาสามัญ');
    if (!drug.indication) return setMsg('err', 'กรุณากรอกสรรพคุณ');
    if (!drug.morning && !drug.noon && !drug.evening && !drug.bed) return setMsg('err', 'กรุณากรอกวิธีกินอย่างน้อย 1 มื้อ');

    const b = $('#dsm_submit'); b.disabled = true; b.textContent = 'กำลังส่ง…';
    const r = await api(Object.assign({ action: 'submitDrug', drug }, auth()));
    b.disabled = false; b.textContent = 'Submit';
    if (r.duplicate) return showDuplicate(drug.barcodeNo, r.drugName);
    if (!r.ok) {
      if (r.error === 'invalid' || r.error === 'pending' || r.error === 'rejected' || r.error === 'locked') { session = null; sessionStorage.removeItem(SESSION_KEY); return viewLogin(msg('err', r.message)); }
      return setMsg('err', r.message || 'ส่งไม่สำเร็จ');
    }
    done('✅ ส่งข้อมูลแล้ว', 'กรุณารอการตรวจสอบข้อมูล หากข้อมูลถูกต้อง จะสามารถใช้บาร์โค้ดยานี้ได้โดยอัตโนมัติ');
  }

  function done(title, text) {
    body().innerHTML = head(title) + msg('ok', text) +
      '<button class="dsm-btn" id="dsm_again" type="button">เพิ่มข้อมูลยาอีกรายการ</button>' +
      '<button class="dsm-btn sec" data-close type="button">ปิด</button>';
    $('#dsm_again').onclick = viewForm;
  }
})();
