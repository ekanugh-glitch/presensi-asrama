// ISI DENGAN WEB APP URL SETELAH DEPLOYMENT APPS SCRIPT
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxlDWCvQhWE_r-RAhiGmhcuICXauPgab7Bi6tKKbU58sy3cBCFZRJYkBLgPa5W4hk0iLA/exec";

let html5QrCode = null;
let currentCameraId = null;
let availableCameras = [];
let masterSiswa = [];
let recentScans = [];
let currentRekapData = null;

// Audio Feedback (Web Audio API)
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

// Inisialisasi App
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

// Load DB Siswa dari Apps Script
async function loadDataSiswa() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getDataSiswa`);
    const json = await res.json();
    if (json.status === 'success') {
      masterSiswa = json.data;
    }
  } catch (err) {
    console.error("Gagal mengambil data siswa", err);
  }
}

// Scanner Management
async function startScanner() {
  document.getElementById('scannerWrapper').classList.remove('hidden');
  document.getElementById('btnStartScan').classList.add('hidden');
  document.getElementById('btnStopScan').classList.remove('hidden');

  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length) {
      availableCameras = devices;
      currentCameraId = devices[devices.length - 1].id; // Default back camera
      if(devices.length > 1) document.getElementById('btnSwitchCam').classList.remove('hidden');

      html5QrCode = new Html5Qrcode("reader");
      await html5QrCode.start(
        currentCameraId,
        { fps: 15, qrbox: { width: 250, height: 180 } },
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

// Perbaikan Logika Pencocokan Barcode saat Scan Berhasil di script.js
async function onScanSuccess(decodedText) {
  const scannedCode = String(decodedText).trim();
  
  // Cocokkan hasil scan kamera dengan kolom BARCODE di data siswa
  const siswa = masterSiswa.find(s => s.barcode === scannedCode || s.id === scannedCode);

  if (!siswa) {
    playErrorSound();
    showAlert(`Barcode "${scannedCode}" Tidak Terdaftar!`, "error");
    return;
  }

  const kegiatan = document.getElementById('selectKegiatan').value;
  const today = new Date().toISOString().split('T')[0];

  showAlert("Memproses presensi...", "info");
  
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'submitPresensi',
        data: {
          idSiswa: siswa.id, // Menyimpan ID Siswa ke log presensi
          nama: siswa.nama,
          kelas: siswa.kelas,
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

function clearSessionList() {
  recentScans = [];
  renderRecentList();
}

// Rekap Modal & WA/PDF Functions
function openRekapModal() { document.getElementById('rekapModal').classList.remove('hidden'); }
function closeRekapModal() { document.getElementById('rekapModal').classList.add('hidden'); }

async function fetchRekapData() {
  const tgl = document.getElementById('filterTanggal').value;
  const keg = document.getElementById('filterKegiatan').value;

  const res = await fetch(`${APPS_SCRIPT_URL}?action=getRekap&tanggal=${tgl}&kegiatan=${keg}`);
  const json = await res.json();

  if (json.status === 'success') {
    currentRekapData = json;
    document.getElementById('statsContainer').classList.remove('hidden');
    document.getElementById('countHadir').innerText = json.hadir.length;
    document.getElementById('countTidakHadir').innerText = json.tidakHadir.length;

    const content = document.getElementById('rekapContent');
    content.innerHTML = `
      <div>
        <h4 class="font-bold text-xs text-rose-600 mb-2">TIDAK HADIR (${json.tidakHadir.length})</h4>
        <div class="space-y-1.5 max-h-40 overflow-y-auto">
          ${json.tidakHadir.map(s => `
            <div class="p-2 bg-rose-50 border border-rose-100 rounded-lg text-xs flex justify-between">
              <span><b>${s.nama}</b> (${s.kelas})</span>
              <span class="text-slate-500">${s.kamar}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

// Copy WA Text Format
function copyWAFormat() {
  if (!currentRekapData) return alert("Silakan tampilkan rekap terlebih dahulu!");
  
  const d = currentRekapData;
  let text = `*REKAP SISWA TIDAK HADIR*\n`;
  text += `📅 Tanggal: ${d.tanggal}\n`;
  text += `🕌 Kegiatan: ${d.kegiatan}\n`;
  text += `-----------------------------------\n\n`;

  if (d.tidakHadir.length === 0) {
    text += `✅ *Alhamdulillah, Seluruh Siswa Hadir.*`;
  } else {
    text += `❌ *Daftar Siswa Tidak Hadir (${d.tidakHadir.length} Anak):*\n`;
    d.tidakHadir.forEach((s, idx) => {
      text += `${idx + 1}. *${s.nama}* | Kelas: ${s.kelas} | Kamar: ${s.kamar}\n`;
    });
  }

  navigator.clipboard.writeText(text);
  alert("Format Rekap WA Berhasil Disalin!");
}

// Print PDF
function printPDF() {
  if (!currentRekapData) return alert("Tampilkan rekap terlebih dahulu!");
  
  const d = currentRekapData;
  const printArea = document.getElementById('printableArea');
  printArea.innerHTML = `
    <div style="font-family: Arial; padding: 20px;">
      <h2 style="text-align:center; margin-bottom: 2px;">LAPORAN PRESENSI KEHADIRAN ASRAMA</h2>
      <p style="text-align:center; margin-top:0;">Tanggal: ${d.tanggal} | Kegiatan: ${d.kegiatan}</p>
      <hr/>
      <h3>A. Siswa Tidak Hadir (${d.tidakHadir.length})</h3>
      <table border="1" cellspacing="0" cellpadding="5" width="100%">
        <tr><th>No</th><th>ID</th><th>Nama</th><th>Kelas</th><th>Kamar</th></tr>
        ${d.tidakHadir.map((s, i) => `
          <tr><td>${i+1}</td><td>${s.id}</td><td>${s.nama}</td><td>${s.kelas}</td><td>${s.kamar}</td></tr>
        `).join('')}
      </table>
      <br/>
      <table width="100%" style="margin-top:30px;">
        <tr>
          <td align="center">Petugas Asrama<br/><br/><br/>(...............................)</td>
          <td align="center">Pengasuh Asrama<br/><br/><br/>(...............................)</td>
        </tr>
      </table>
    </div>
  `;

  window.print();
}

// Generate Sheet Barcode Trigger
async function triggerGenerateBarcode() {
  if (!confirm("Buat/Update Sheet BARCODE_SISWA di Google Sheets?")) return;
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'generateBarcodeSheet' })
  });
  const json = await res.json();
  alert(json.message);
}