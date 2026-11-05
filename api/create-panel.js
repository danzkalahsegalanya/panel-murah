import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const { email, username, ram, uid } = req.body;

  // Konfigurasi Pterodactyl lu (Disamain sama script bot)
  const DOMAIN = "https://srv2.cristall.my.id";
  const API_KEY = "ptla_grahKdZyOpmLrn8AlagBblMEd22PPplOUf662TqtrlR";
  const NEST_ID = 5;
  const EGG_ID = 15;
  const LOC_ID = 1;

  try {
    // 1. Generate Password Random (biar aman)
    const password = Math.random().toString(36).slice(-8) + "A1!";
    
    // 2. Tentukan RAM, Disk, CPU berdasarkan input user
    let mem = 1000, disk = 1000, cpu = 40;
    const ramStr = ram.toString().toLowerCase();
    
    if (ramStr === "unlimited" || ramStr === "unli") {
      mem = 0; disk = 0; cpu = 0;
    } else {
      const gb = parseInt(ramStr.replace("gb", ""));
      mem = gb * 1000;
      disk = gb * 1000;
      cpu = 20 + (gb * 20); // 1gb=40, 2gb=60, dst
    }

    // 3. Buat User di Pterodactyl
    const userRes = await axios.post(`${DOMAIN}/api/application/users`, {
      email: email,
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
    const usr_id = user.id;

    // 4. Ambil Startup Command dari Egg
    const eggRes = await axios.get(`${DOMAIN}/api/application/nests/${NEST_ID}/eggs/${EGG_ID}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
    });
    const startup_cmd = eggRes.data.attributes.startup;

    // 5. Buat Server di Pterodactyl
    const serverRes = await axios.post(`${DOMAIN}/api/application/servers`, {
      name: `${username} Server`,
      description: "Created via Web Kitzune Store",
      user: usr_id,
      egg: EGG_ID,
      docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
      startup: startup_cmd,
      environment: {
        "INST": "npm",
        "USER_UPLOAD": "0",
        "AUTO_UPDATE": "0",
        "CMD_RUN": "npm start" // INI KUNCI YANG BIKIN ERROR KEMARIN
      },
      limits: {
        memory: mem,
        swap: 0,
        disk: disk,
        io: 500,
        cpu: cpu
      },
      feature_limits: {
        databases: 5,
        backups: 5,
        allocations: 5
      },
      deploy: {
        locations: [LOC_ID],
        dedicated_ip: false,
        port_range: []
      }
    }, {
      headers: { 
        'Authorization': `Bearer ${API_KEY}`, 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const server = serverRes.data.attributes;

    // 6. Kirim balik data login ke web
    return res.status(200).json({ 
      success: true, 
      serverId: server.id,
      username: user.username,
      password: password
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.response?.data?.errors?.[0]?.detail || error.message 
    });
  }
}
