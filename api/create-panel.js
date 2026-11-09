import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const { mode, email, username, ram, egg_id } = req.body;

  // ================= KONFIGURASI DARI ENV VERCEL =================
  const DOMAIN = process.env.PTERO_PANEL_URL;
  const API_KEY = process.env.PTERO_APPLICATION_API_KEY;
  
  const NEST_ID = process.env.NEST_ID || 5;
  const LOC_ID = process.env.LOCATION_ID || 1;
  
  // Default ke Node.js v1 (15) kalau frontend tidak ngirim
  const EGG_ID = egg_id ? parseInt(egg_id) : (process.env.EGG_NODEJS_V1 || 15);
  // ===============================================================

  if (!DOMAIN || !API_KEY) {
    return res.status(500).json({ success: false, error: "Konfigurasi server (env) belum lengkap." });
  }

  // VALIDASI HARGA DI SERVER (Mencegah manipulasi harga dari Inspect Element)
  const HARGA_VALID = {
    "1GB": 300, "2GB": 450, "3GB": 600, "4GB": 750, "5GB": 900,
    "6GB": 1050, "7GB": 1200, "8GB": 1350, "9GB": 1500, "10GB": 1700, "Unlimited": 2000
  };
  
  if (!HARGA_VALID[ram]) {
    return res.status(400).json({ success: false, error: "Paket RAM tidak valid." });
  }

  try {
    let targetUser = null;
    
    // --- FORMAT PASSWORD BARU: {username}{4 angka random} ---
    const cleanUsername = username.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const randomNumbers = Math.floor(1000 + Math.random() * 9000); // 4 digit acak
    const password = `${cleanUsername}${randomNumbers}`; 

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
      const searchEmail = `${cleanUsername}@kitzunemarket.com`;
      const findUserRes = await axios.get(`${DOMAIN}/api/application/users?filter[email]=${searchEmail}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
      });

      if (!findUserRes.data.data || findUserRes.data.data.length === 0) {
        throw new Error(`Akun dengan username "${username}" tidak ditemukan di panel.`);
      }
      targetUser = findUserRes.data.data[0].attributes; 
    }

    if (!targetUser) throw new Error("Gagal mendapatkan data user.");

    // --- AMBIL DATA EGG (Startup CMD, Docker Image, & Environment) ---
    const eggRes = await axios.get(`${DOMAIN}/api/application/nests/${NEST_ID}/eggs/${EGG_ID}?include=variables`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
    });
    
    const eggData = eggRes.data.attributes;
    const startup_cmd = eggData.startup;
    
    // Ambil Docker Image default dari Egg
    const dockerImage = eggData.docker_images[Object.keys(eggData.docker_images)[0]];
    
    // Ambil Environment default dari Egg (PENTING buat Python)
    let envVars = {};
    if (eggData.relationships && eggData.relationships.variables) {
        eggData.relationships.variables.data.forEach(v => {
            envVars[v.attributes.env_variable] = v.attributes.default_value;
        });
    }

    // --- FORMAT NAMA SERVER ---
    const paketLabel = ramStr === "unlimited" || ramStr === "unli" ? "UNLI" : ramStr.toUpperCase();
    const serverName = mode === "addserver" ? `${targetUser.username} [${paketLabel}] ADD` : `${targetUser.username} [${paketLabel}]`;

    // --- BUAT SERVER ---
    const serverRes = await axios.post(`${DOMAIN}/api/application/servers`, {
      name: serverName,
      description: "BY KITZUNE MARKET",
      user: targetUser.id,
      egg: EGG_ID,
      docker_image: dockerImage, // <--- Otomatis nyesuaiin Egg
      startup: startup_cmd,
      environment: envVars, // <--- Otomatis nyesuaiin Egg
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
