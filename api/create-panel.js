import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const { email, username, ram } = req.body;

  // ================= KONFIGURASI LU =================
  const DOMAIN = "https://srv2.cristall.my.id";
  const API_KEY = "ptla_grahKdZyOpmLrn8AlagBblMEd22PPplOUf662TqtrlR";
  
  const NEST_ID = 5; 
  const EGG_ID = 15; 
  const LOC_ID = 1;
  // ===================================================

  try {
    // 1. Generate Password Random
    const password = Math.random().toString(36).slice(-8) + "A1!";
    
    // 2. Tentukan RAM, Disk, CPU
    let mem = 1000, disk = 1000, cpu = 40;
    const ramStr = ram.toString().toLowerCase();
    
    if (ramStr === "unlimited" || ramStr === "unli") {
      mem = 0; disk = 0; cpu = 0;
    } else {
      const gb = parseInt(ramStr.replace("gb", ""));
      mem = gb * 1000;
      disk = gb * 1000;
      cpu = 20 + (gb * 20); 
    }

    // 3. Buat User Pterodactyl (Email Unik)
    const uniqueEmail = `${username}-${Date.now()}@kitzunemarket.com`;

    const userRes = await axios.post(`${DOMAIN}/api/application/users`, {
      email: uniqueEmail,
      username: username.toLowerCase().replace(/[^a-z0-9]/g, ''),
      first_name: username,
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

    const user = userRes.data.attributes;

    // 4. Ambil Startup Command dari Egg
    const eggRes = await axios.get(`${DOMAIN}/api/application/nests/${NEST_ID}/eggs/${EGG_ID}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
    });
    const startup_cmd = eggRes.data.attributes.startup;

    // 5. Buat Server (Pakai environment manual yang udah pasti jalan)
    const serverRes = await axios.post(`${DOMAIN}/api/application/servers`, {
      name: `${username} Server`,
      description: "Created via Web Kitzune Store",
      user: user.id,
      egg: EGG_ID,
      docker_image: "ghcr.io/parkervcp/yolks:nodejs_18", // Pake image yang umum
      startup: startup_cmd,
      environment: {
        "INST": "npm",
        "USER_UPLOAD": "0",
        "AUTO_UPDATE": "0",
        "CMD_RUN": "npm start"
      },
      limits: {
        memory: mem,
        swap: 0,
        disk: disk,
        io: 500,
        cpu: cpu
      },
      feature_limits: { databases: 5, backups: 5, allocations: 5 },
      deploy: { locations: [LOC_ID], dedicated_ip: false, port_range: [] }
    }, {
      headers: { 
        'Authorization': `Bearer ${API_KEY}`, 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // 6. Sukses
    return res.status(200).json({ 
      success: true, 
      serverId: serverRes.data.attributes.id,
      username: user.username,
      password: password
    });

  } catch (error) {
    console.error("Pterodactyl Error:", error.response?.data || error.message);
    
    let errorMsg = "Unknown error";
    if (error.response?.data?.errors) {
      errorMsg = error.response.data.errors.map(e => `${e.code}: ${e.detail}`).join(" | ");
    } else if (error.response?.data?.error) {
      errorMsg = error.response.data.error;
    } else {
      errorMsg = error.message;
    }

    return res.status(500).json({ 
      success: false, 
      error: errorMsg
    });
  }
}
