import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: "Method not allowed" });

  const { mode, email, username, ram, egg_id, nest_id } = req.body;

  // ================= KONFIGURASI DARI ENV VERCEL =================
  const DOMAIN = process.env.PTERO_PANEL_URL;
  const API_KEY = process.env.PTERO_APPLICATION_API_KEY;

  const NEST_ID = nest_id ? parseInt(nest_id) : (process.env.NEST_ID || 5);
  const LOC_ID = process.env.LOCATION_ID || 1;
  const EGG_ID = egg_id ? parseInt(egg_id) : (process.env.EGG_NODEJS_V1 || 15);
  // ===============================================================

  if (!DOMAIN || !API_KEY) {
    return res.status(500).json({ success: false, error: "Konfigurasi server (env) belum lengkap." });
  }

  if (!mode || !email || !username || !ram) {
    return res.status(400).json({ success: false, error: "Parameter tidak lengkap." });
  }

  // VALIDASI HARGA DI SERVER
  const HARGA_VALID = {
    "1GB": 300, "2GB": 450, "3GB": 600, "4GB": 750, "5GB": 900,
    "6GB": 1050, "7GB": 1200, "8GB": 1350, "9GB": 1500, "10GB": 1700, "Unlimited": 2000
  };

  if (!HARGA_VALID[ram]) {
    return res.status(400).json({ success: false, error: "Paket RAM tidak valid." });
  }

  if (mode !== "new" && mode !== "addserver") {
    return res.status(400).json({ success: false, error: "Mode tidak valid." });
  }

  try {
    // --- NORMALISASI USERNAME ---
    const cleanUsername = username.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      return res.status(400).json({ success: false, error: "Username harus 3-32 karakter (huruf, angka, strip)." });
    }

    const randomNumbers = Math.floor(1000 + Math.random() * 9000);
    const password = `${cleanUsername}${randomNumbers}`;
    const panelEmail = `${cleanUsername}@kitzunemarket.com`;

    // --- TENTUKAN SPESIFIKASI RAM ---
    let mem = 1000, disk = 1000, cpu = 40;
    const ramStr = ram.toString().toLowerCase();

    if (ramStr === "unlimited" || ramStr === "unli") {
      mem = 0; disk = 0; cpu = 0;
    } else {
      const gb = parseInt(ramStr.replace("gb", ""));
      if (isNaN(gb) || gb < 1) {
        return res.status(400).json({ success: false, error: "Format RAM tidak valid." });
      }
      mem = gb * 1000; disk = gb * 1000; cpu = 20 + (gb * 20);
    }

    let targetUser = null;

    // ==========================================
    // MODE 1: BUAT PANEL BARU (Bikin User + Server)
    // ==========================================
    if (mode === "new") {
      // Cek dulu apakah user sudah ada (biar tidak error duplicate)
      const existingUser = await findUserByUsername(DOMAIN, API_KEY, cleanUsername);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: `Username "${cleanUsername}" sudah terdaftar. Gunakan username lain.`
        });
      }

      const userRes = await axios.post(`${DOMAIN}/api/application/users`, {
        email: panelEmail,
        username: cleanUsername,
        first_name: cleanUsername.substring(0, 32),
        last_name: "Server",
        language: "en",
        password: password
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      targetUser = userRes.data.attributes;

    // ==========================================
    // MODE 2: ADD SERVER (Cari User Existing)
    // ==========================================
    } else if (mode === "addserver") {
      // ⚠️ FIX: filter[email] TIDAK DIDUKUNG di Pterodactyl
      // Pakai filter[username] atau fallback ke search manual
      targetUser = await findUserByUsername(DOMAIN, API_KEY, cleanUsername);

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: `Akun dengan username "${cleanUsername}" tidak ditemukan di panel. Buat panel baru dulu.`
        });
      }

      // Verifikasi email panel match (defense in depth)
      if (targetUser.email !== panelEmail) {
        return res.status(400).json({
          success: false,
          error: `Username "${cleanUsername}" tidak cocok dengan akun panel manapun.`
        });
      }
    }

    if (!targetUser) throw new Error("Gagal mendapatkan data user.");

    // --- AMBIL DATA EGG (Startup CMD, Docker Image, Environment) ---
    let eggData;
    try {
      const eggRes = await axios.get(
        `${DOMAIN}/api/application/nests/${NEST_ID}/eggs/${EGG_ID}?include=variables`,
        { headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' } }
      );
      eggData = eggRes.data.attributes;
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: `Gagal mengambil data egg ${EGG_ID} dari nest ${NEST_ID}. Cek konfigurasi.`
      });
    }

    const startup_cmd = eggData.startup;
    const dockerImage = eggData.docker_images[Object.keys(eggData.docker_images)[0]];

    let envVars = {};
    if (eggData.relationships?.variables?.data) {
      eggData.relationships.variables.data.forEach(v => {
        envVars[v.attributes.env_variable] = v.attributes.default_value;
      });
    }

    // --- FORMAT NAMA SERVER ---
    const paketLabel = (ramStr === "unlimited" || ramStr === "unli") ? "UNLI" : ramStr.toUpperCase();
    const suffix = mode === "addserver" ? ` [${paketLabel}] ADD` : ` [${paketLabel}]`;
    const serverName = (targetUser.username + suffix).substring(0, 191); // Ptero max 191

    // --- BUAT SERVER ---
    const serverRes = await axios.post(`${DOMAIN}/api/application/servers`, {
      name: serverName,
      description: "BY KITZUNE MARKET",
      user: targetUser.id,
      egg: EGG_ID,
      docker_image: dockerImage,
      startup: startup_cmd,
      environment: envVars,
      limits: { memory: mem, swap: 0, disk: disk, io: 500, cpu: cpu },
      feature_limits: { databases: 5, backups: 5, allocations: 5 },
      deploy: { locations: [LOC_ID], dedicated_ip: false, port_range: [] }
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    return res.status(200).json({
      success: true,
      serverId: serverRes.data.attributes.id,
      username: targetUser.username,
      password: mode === "new" ? password : null,
      isNew: mode === "new"
    });

  } catch (error) {
    let errorMsg = "Unknown error";
    if (error.response?.data?.errors) {
      errorMsg = error.response.data.errors.map(e => `${e.code}: ${e.detail}`).join(" | ");
    } else if (error.response?.data?.error) {
      errorMsg = error.response.data.error;
    } else {
      errorMsg = error.message || String(error);
    }
    console.error("[create-panel] Error:", errorMsg);
    return res.status(500).json({ success: false, error: errorMsg });
  }
}

/**
 * Cari user Pterodactyl berdasarkan username.
 * Karena filter[email] TIDAK DIDUKUNG, kita pakai filter[username] 
 * lalu fallback ke pagination scan kalau perlu.
 */
async function findUserByUsername(DOMAIN, API_KEY, cleanUsername) {
  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' };

  // Method 1: filter[username] (didukung Pterodactyl)
  try {
    const res = await axios.get(
      `${DOMAIN}/api/application/users?filter[username]=${encodeURIComponent(cleanUsername)}`,
      { headers }
    );
    const users = res.data?.data || [];
    const match = users.find(u => u.attributes.username === cleanUsername);
    if (match) return match.attributes;
  } catch (e) {
    console.warn("[findUserByUsername] filter[username] failed:", e.message);
  }

  // Method 2: fallback - scan semua halaman
  try {
    let page = 1;
    while (page <= 20) { // max 20 halaman = 200 user, cukup untuk toko kecil
      const res = await axios.get(
        `${DOMAIN}/api/application/users?page=${page}&per_page=50`,
        { headers }
      );
      const users = res.data?.data || [];
      if (users.length === 0) break;

      const match = users.find(u => u.attributes.username === cleanUsername);
      if (match) return match.attributes;

      const meta = res.data?.meta?.pagination;
      if (!meta || page >= meta.total_pages) break;
      page++;
    }
  } catch (e) {
    console.error("[findUserByUsername] fallback scan failed:", e.message);
  }

  return null;
}
