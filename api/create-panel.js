// api/create-panel.js
import axios from 'axios';

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') return res.status(405).end();

  const { email, username, ram, harga, uid } = req.body;

  // Konfigurasi Pterodactyl (Ambil dari Environment Vercel)
  const PTERO_URL = process.env.PTERO_DOMAIN;
  const PTERO_API_KEY = process.env.PTERO_API_KEY; 
  
  if (!PTERO_URL || !PTERO_API_KEY) {
    return res.status(500).json({ error: "Konfigurasi server belum lengkap." });
  }

  try {
    // 1. Bikin Password Random
    const generatePassword = () => Math.random().toString(36).slice(-8) + "A1!";
    const randomPassword = generatePassword();

    // 2. Buat User di Pterodactyl
    const userRes = await axios.post(`${PTERO_URL}/api/application/users`, {
      email: email,
      username: username.toLowerCase().replace(/[^a-z0-9]/g, ''), // Hanya huruf & angka
      first_name: username,
      last_name: "Kitzune",
      password: randomPassword
    }, {
      headers: { 
        'Authorization': `Bearer ${PTERO_API_KEY}`, 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const userId = userRes.data.attributes.id;

    // 3. Buat Server Panel
    const serverRes = await axios.post(`${PTERO_URL}/api/application/servers`, {
      name: `Panel-${username}`,
      user: userId,
      egg: 15, // Sesuai global.egg lu
      docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
      startup: "npm start",
      environment: {},
      limits: { 
        memory: parseInt(ram), // RAM dari input user
        swap: 0, 
        disk: 1024, 
        io: 500, 
        cpu: 100 
      },
      feature_limits: { databases: 0, allocations: 1, backups: 0 },
      deploy: { 
        locations: [1], // Sesuai global.loc lu
        dedicated_ip: false, 
        port_range: [] 
      }
    }, {
      headers: { 
        'Authorization': `Bearer ${PTERO_API_KEY}`, 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // 4. Kembalikan data login ke Frontend (Web)
    return res.status(200).json({ 
      success: true, 
      serverId: serverRes.data.attributes.id,
      password: randomPassword,
      username: username
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.errors[0]?.detail || error.message });
  }
}

