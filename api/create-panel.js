import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const { mode, email, username, ram } = req.body;

  // ================= KONFIGURASI LU =================
  const DOMAIN = "https://srv2.cristall.my.id";
  const API_KEY = "ptla_grahKdZyOpmLrn8AlagBblMEd22PPplOUf662TqtrlR";
  const NEST_ID = 5; 
  const EGG_ID = 15; 
  const LOC_ID = 1;
  // ===================================================

  try {
    let targetUser = null;
    const password = Math.random().toString(36).slice(-8) + "A1!"; // Buat user baru

    // --- TENTUKAN SPESIFIKASI RAM ---
    let mem = 1000, disk = 1000, cpu = 40;
    const ramStr = ram.toString().toLowerCase();
    if (ramStr === "unlimited" || ramStr === "unli") {
      mem = 0; disk = 0; cpu = 0;
    } else {
      const gb = parseInt(ramStr.replace("gb", ""));
      mem = gb * 1000; disk = gb * 1000; cpu = 20 + (gb * 20); 
    }

    // ==========================================
    // MODE 1: BUAT PANEL BARU (Bikin User + Server)
    // ==========================================
    if (mode === "new") {
      const cleanUsername = username.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const newEmail = `${cleanUsername}@kitzunemarket.com`;

      // 1. Buat User
      const userRes = await axios.post(`${DOMAIN}/api/application/users`, {
        email: newEmail,
        username: cleanUsername,
        first_name: username, 
        last_name: "Server",
        language: "en",
        password: password
      }, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });
      targetUser = userRes.data.attributes;

    // ==========================================
    // MODE 2: ADD SERVER (Cari User, Gak Bikin User Baru)
    // ==========================================
    } else if (mode === "addserver") {
      // Cari ID User berdasarkan Email
      const searchEmail = `${username.toLowerCase()}@kitzunemarket.com`;
      const findUserRes = await axios.get(`${DOMAIN}/api/application/users?filter[email]=${searchEmail}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
      });

      if (!findUserRes.data.data || findUserRes.data.data.length === 0) {
        throw new Error(`Akun dengan username "${username}" tidak ditemukan di panel.`);
      }
      targetUser = findUserRes.data.data[0].attributes; // Ambil user pertama yang ketemu
    }

    if (!targetUser) throw new Error("Gagal mendapatkan data user.");

    // --- AMBIL STARTUP CMD ---
    const eggRes = await axios.get(`${DOMAIN}/api/application/nests/${NEST_ID}/eggs/${EGG_ID}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
    });
    const startup_cmd = eggRes.data.attributes.startup;

    // --- FORMAT NAMA SERVER ---
    const paketLabel = ramStr === "unlimited" || ramStr === "unli" ? "UNLI" : ramStr.toUpperCase();
    // Kasih embel-embel "ADD" kalau dia nambah server, biar gampang dibedain
    const serverName = mode === "addserver" ? `${targetUser.username} [${paketLabel}] ADD` : `${targetUser.username} [${paketLabel}]`;

    // --- BUAT SERVER ---
    const serverRes = await axios.post(`${DOMAIN}/api/application/servers`, {
      name: serverName,
      description: "BY KITZUNE MARKET",
      user: targetUser.id,
      egg: EGG_ID,
      docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
      startup: startup_cmd,
      environment: { "INST": "npm", "USER_UPLOAD": "0", "AUTO_UPDATE": "0", "CMD_RUN": "npm start" },
      limits: { memory: mem, swap: 0, disk: disk, io: 500, cpu: cpu },
      feature_limits: { databases: 5, backups: 5, allocations: 5 },
      deploy: { locations: [LOC_ID], dedicated_ip: false, port_range: [] }
    }, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }
    });

    // --- SUKSES ---
    return res.status(200).json({ 
      success: true, 
      serverId: serverRes.data.attributes.id,
      username: targetUser.username,
      password: mode === "new" ? password : "Sama dengan password akun lama",
      isNew: mode === "new"
    });

  } catch (error) {
    let errorMsg = "Unknown error";
    if (error.response?.data?.errors) {
      errorMsg = error.response.data.errors.map(e => `${e.code}: ${e.detail}`).join(" | ");
    } else {
      errorMsg = error.message;
    }
    return res.status(500).json({ success: false, error: errorMsg });
  }
}
