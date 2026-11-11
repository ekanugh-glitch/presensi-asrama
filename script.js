const APPS_SCRIPT_URL = "GANTI_DENGAN_WEB_APP_URL_ANDA";

let html5QrCode = null;
let currentCameraId = null;
let availableCameras = [];
let masterSiswa = [];
let recentScans = [];
let currentRekapData = null;
let isScanningPaused = false;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playAudioSignal(freq, duration) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = freq;
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function playSuccessSound() { playAudioSignal(800, 0.15); }
function playErrorSound() {
  playAudioSignal(300, 0.1);
  setTimeout(() => playAudioSignal(200, 0.25), 100);
}

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  document.getElementById('filterTanggal').valueAsDate = new Date();
  loadDataSiswa();
});

function updateClock() {
  const now = new Date();
  document.getElementById('clock').innerText = now.toLocaleTimeString('id-ID');
}

async function loadDataSiswa() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getDataSiswa`);
    const json = await res.json();
    if (json.status === 'success') {
      masterSiswa = json.data;
      populateDropdownFilters();
    }
  } catch (err) {
    console.error("Gagal mengambil data siswa", err);
  }
}

function populateDropdownFilters() {
  const kelasSet = [...new Set(masterSiswa.map(s => s.kelas))].sort();
  const kelasSelect = document.getElementById('filterKelas');
  if(kelasSelect) {
    kelasSelect.innerHTML = `<option value="ALL">Semua Kelas</option>` + kelasSet.map(k => `<option value="${k}">${k}</option>`).join('');
  }
}

// 1. Validasi Kegiatan Dipilih Terlebih Dahulu
function handleActivityChange() {
  const select = document.getElementById('selectKegiatan');
  const btn = document.getElementById('btnStartScan');
  const badge = document.getElementById('selectedActivityBadge');

  if (select.value) {
    btn.disabled = false;
    btn.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
    btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700', 'text-white', 'shadow-md');
    badge.className = "text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold";
    badge.innerText = "Kegiatan Dipilih: " + select.value;
  }
}

async function startScanner() {
  const kegiatan = document.getElementById('selectKegiatan').value;
  if (!kegiatan) {
    alert("Silakan pilih kegiatan terlebih dahulu!");
    return;
  }

  document.getElementById('scannerWrapper').classList.remove('hidden');
  document.getElementById('btnStartScan').classList.add('hidden');
  document.getElementById('btnStopScan').classList.remove('hidden');

  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length) {
      availableCameras = devices;
      currentCameraId = devices[devices.length - 1].id;
      if(devices.length > 1) document.getElementById('btnSwitchCam').classList.remove('hidden');

      html5QrCode = new Html5Qrcode("reader");
      await html5QrCode.start(
        currentCameraId,
        { fps: 10, qrbox: { width: 250, height: 180 } },
        onScanSuccess
      );
    }
  } catch (err) {
    showAlert("Gagal mengakses kamera!", "error");
  }
}

async function stopScanner() {
  if (html5QrCode) {
    await html5QrCode.stop();
    html5QrCode = null;
  }
  document.getElementById('scannerWrapper').classList.add('hidden');
  document.getElementById('btnStartScan').classList.remove('hidden');
  document.getElementById('btnStopScan').classList.add('hidden');
  document.getElementById('btnSwitchCam').classList.add('hidden');
}

async function switchCamera() {
  if (availableCameras.length > 1) {
    await stopScanner();
    currentCameraId = (currentCameraId === availableCameras[0].id) ? availableCameras[1].id : availableCameras[0].id;
    startScanner();
  }
}

async function onScanSuccess(decodedText) {
  if (isScanningPaused) return;

  const scannedCode = String(decodedText).trim();
  const siswa = masterSiswa.find(s => s.barcode === scannedCode || s.id === scannedCode);

  if (!siswa) {
    playErrorSound();
    showAlert(`Barcode "${scannedCode}" Tidak Terdaftar!`, "error");
    return;
  }

  isScanningPaused = true;
  setTimeout(() => { isScanningPaused = false; }, 3000);

  const kegiatan = document.getElementById('selectKegiatan').value;
  const today = new Date().toISOString().split('T')[0];

  showAlert("Memproses presensi...", "info");
  
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'submitPresensi',
        data: {
          idSiswa: siswa.id,
          nama: siswa.nama,
          kelas: siswa.kelas,
          jk: siswa.jk,
          kamar: siswa.kamar,
          kegiatan: kegiatan,
          tanggal: today
        }
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      playSuccessSound();
      if (navigator.vibrate) navigator.vibrate(100);
      showAlert(`✅ ${result.data.nama} (HADIR)`, "success");
      
      recentScans.unshift(result.data);
      renderRecentList();
    } else if (result.status === 'duplicate') {
      playErrorSound();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      showAlert(`⚠️ ${result.message}`, "duplicate");
    }
  } catch (err) {
    playErrorSound();
    showAlert("Gagal terhubung ke server!", "error");
  }
}

function showAlert(msg, type) {
  const box = document.getElementById('alertBox');
  box.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-800', 'bg-rose-100', 'text-rose-800', 'bg-amber-100', 'text-amber-800', 'bg-slate-100');
  
  if (type === 'success') box.classList.add('bg-emerald-100', 'text-emerald-800');
  else if (type === 'error') box.classList.add('bg-rose-100', 'text-rose-800');
  else if (type === 'duplicate') box.classList.add('bg-amber-100', 'text-amber-800');
  else box.classList.add('bg-slate-100', 'text-slate-800');

  box.innerText = msg;
}

function renderRecentList() {
  const container = document.getElementById('recentList');
  document.getElementById('scanCount').innerText = recentScans.length;
  
  if (!recentScans.length) {
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada presensi pada sesi ini</p>`;
    return;
  }

  container.innerHTML = recentScans.map(s => `
    <div class="flex justify-between items-center p-2.5 bg-slate-50 border rounded-xl text-xs">
      <div>
        <p class="font-bold text-slate-800">${s.nama}</p>
        <p class="text-slate-500">${s.kelas} • ${s.kamar}</p>
      </div>
      <span class="font-mono bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">${s.jam}</span>
    </div>
  `).join('');
}

function openRekapModal() { document.getElementById('rekapModal').classList.remove('hidden'); }
function closeRekapModal() { document.getElementById('rekapModal').classList.add('hidden'); }

// 3. Rekap Redesign & Statistik Persentase
async function fetchRekapData() {
  const tgl = document.getElementById('filterTanggal').value;
  const keg = document.getElementById('filterKegiatan').value;
  const kelas = document.getElementById('filterKelas').value;
  const jk = document.getElementById('filterJK').value;

  const res = await fetch(`${APPS_SCRIPT_URL}?action=getRekap&tanggal=${tgl}&kegiatan=${keg}&kelas=${kelas}&jk=${jk}`);
  const json = await res.json();

  if (json.status === 'success') {
    currentRekapData = json;
    document.getElementById('statsContainer').classList.remove('hidden');
    document.getElementById('rekapContentWrapper').classList.remove('hidden');
    
    const totalSiswa = json.hadir.length + json.tidakHadir.length;
    const persentase = totalSiswa > 0 ? Math.round((json.hadir.length / totalSiswa) * 100) : 0;

    document.getElementById('countHadir').innerText = json.hadir.length;
    document.getElementById('countTidakHadir').innerText = json.tidakHadir.length;
    document.getElementById('badgeHadir').innerText = json.hadir.length;
    document.getElementById('badgeTidakHadir').innerText = json.tidakHadir.length;
    document.getElementById('persentaseHadir').innerText = persentase + '%';
    document.getElementById('progressBar').style.width = persentase + '%';

    renderRekapLists();
  }
}

function renderRekapLists() {
  const d = currentRekapData;
  
  // List Tidak Hadir dengan Pilihan Keterangan
  const containerTidakHadir = document.getElementById('listTidakHadirContainer');
  if (d.tidakHadir.length === 0) {
    containerTidakHadir.innerHTML = `<div class="p-4 bg-emerald-50 text-emerald-700 text-center rounded-xl text-xs font-bold">✨ Alhamdulillah, seluruh siswa hadir!</div>`;
  } else {
    containerTidakHadir.innerHTML = d.tidakHadir.map(s => `
      <div class="p-3 bg-white border border-rose-100 rounded-xl shadow-xs space-y-2 text-xs">
        <div class="flex justify-between items-start">
          <div>
            <p class="font-bold text-slate-800 text-sm">${s.nama}</p>
            <p class="text-slate-500 font-medium">Kelas: ${s.kelas} • Kamar: ${s.kamar}</p>
          </div>
          <span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold text-[10px]">TIDAK HADIR</span>
        </div>
        <div>
          <label class="text-[10px] font-bold text-slate-400 uppercase">Status Keterangan</label>
          <select onchange="updateKeteranganSiswa('${s.id}', this.value)" class="w-full mt-0.5 p-2 bg-slate-50 border rounded-lg font-semibold text-slate-700">
            <option value="Alpa" ${s.keterangan==='Alpa'?'selected':''}>🔴 Alpa (Tanpa Keterangan)</option>
            <option value="Sakit" ${s.keterangan==='Sakit'?'selected':''}>🟡 Sakit</option>
            <option value="Izin" ${s.keterangan==='Izin'?'selected':''}>🔵 Izin Keperluan Tertentu</option>
            <option value="Pulang" ${s.keterangan==='Pulang'?'selected':''}>🟢 Pulang / Izin di Rumah</option>
          </select>
        </div>
      </div>
    `).join('');
  }

  // List Hadir
  const containerHadir = document.getElementById('listHadirContainer');
  if (d.hadir.length === 0) {
    containerHadir.innerHTML = `<div class="p-4 bg-slate-100 text-slate-500 text-center rounded-xl text-xs font-semibold">Belum ada data siswa hadir.</div>`;
  } else {
    containerHadir.innerHTML = d.hadir.map(s => `
      <div class="p-3 bg-white border border-emerald-100 rounded-xl shadow-xs flex justify-between items-center text-xs">
        <div>
          <p class="font-bold text-slate-800">${s.nama}</p>
          <p class="text-slate-500 font-medium">Kelas: ${s.kelas} • Kamar: ${s.kamar}</p>
        </div>
        <span class="font-mono bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg font-bold">${s.jam}</span>
      </div>
    `).join('');
  }
}

function switchTab(tab) {
  const btnTidakHadir = document.getElementById('tabBtnTidakHadir');
  const btnHadir = document.getElementById('tabBtnHadir');
  const listTidakHadir = document.getElementById('listTidakHadirContainer');
  const listHadir = document.getElementById('listHadirContainer');

  if (tab === 'tidakHadir') {
    btnTidakHadir.className = "flex-1 py-2 rounded-lg bg-white shadow-sm text-rose-600 font-bold transition-all";
    btnHadir.className = "flex-1 py-2 rounded-lg text-slate-500 font-medium transition-all";
    listTidakHadir.classList.remove('hidden');
    listHadir.classList.add('hidden');
  } else {
    btnHadir.className = "flex-1 py-2 rounded-lg bg-white shadow-sm text-emerald-600 font-bold transition-all";
    btnTidakHadir.className = "flex-1 py-2 rounded-lg text-slate-500 font-medium transition-all";
    listHadir.classList.remove('hidden');
    listTidakHadir.classList.add('hidden');
  }
}

function updateKeteranganSiswa(idSiswa, ket) {
  const siswa = currentRekapData.tidakHadir.find(s => s.id === idSiswa);
  if (siswa) siswa.keterangan = ket;
}

function copyWAFormat() {
  if (!currentRekapData) return alert("Silakan tampilkan rekap terlebih dahulu!");
  
  const d = currentRekapData;
  let text = `*REKAP PRESENSI ASRAMA*\n`;
  text += `📅 Tanggal: ${d.tanggal}\n`;
  text += `🕌 Kegiatan: ${d.kegiatan}\n`;
  text += `-----------------------------------\n\n`;

  text += `✅ *Hadir:* ${d.hadir.length} Anak\n`;
  text += `❌ *Tidak Hadir:* ${d.tidakHadir.length} Anak\n\n`;

  if (d.tidakHadir.length > 0) {
    text += `*Rincian Tidak Hadir:*\n`;
    d.tidakHadir.forEach((s, idx) => {
      text += `${idx + 1}. *${s.nama}* (${s.kelas}) - Kamar ${s.kamar}\n   ↳ Keterangan: *${s.keterangan}*\n`;
    });
  }

  navigator.clipboard.writeText(text);
  alert("Format Rekap WA Berhasil Disalin!");
}

function printPDF() {
  if (!currentRekapData) return alert("Tampilkan rekap terlebih dahulu!");
  
  const d = currentRekapData;
  const printArea = document.getElementById('printableArea');
  printArea.innerHTML = `
    <div style="font-family: Arial; padding: 20px;">
      <h2 style="text-align:center; margin-bottom: 2px;">LAPORAN PRESENSI KEHADIRAN ASRAMA</h2>
      <p style="text-align:center; margin-top:0;">Tanggal: ${d.tanggal} | Kegiatan: ${d.kegiatan}</p>
      <hr/>
      <h3>Daftar Siswa Tidak Hadir (${d.tidakHadir.length})</h3>
      <table border="1" cellspacing="0" cellpadding="5" width="100%">
        <tr><th>No</th><th>Nama</th><th>Kelas</th><th>Kamar</th><th>Keterangan</th></tr>
        ${d.tidakHadir.map((s, i) => `
          <tr><td>${i+1}</td><td>${s.nama}</td><td>${s.kelas}</td><td>${s.kamar}</td><td><b>${s.keterangan}</b></td></tr>
        `).join('')}
      </table>
      <br/><br/>
      <table width="100%">
        <tr>
          <td align="center">Petugas Asrama<br/><br/><br/>(...............................)</td>
          <td align="center">Pengasuh Asrama<br/><br/><br/>(...............................)</td>
        </tr>
      </table>
    </div>
  `;

  window.print();
}
