import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const { users } = req.body; // Array of usernames

  // Panggil dari Environment Variables Vercel
  const DOMAIN = process.env.PTERO_PANEL_URL;
  const API_KEY = process.env.PTERO_APPLICATION_API_KEY;

  if (!DOMAIN || !API_KEY) {
    return res.status(500).json({ success: false, error: "Konfigurasi env belum lengkap." });
  }

  if (!users || !Array.isArray(users) || users.length === 0) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    // Ambil semua user di Pterodactyl
    const allUsersRes = await axios.get(`${DOMAIN}/api/application/users`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
    });

    // Simpan username yang ada di panel ke dalam Set biar pencariannya instan (O(1))
    const existingUsernames = new Set(
      allUsersRes.data.data.map(u => u.attributes.username.toLowerCase())
    );

    // Cek mana aja yang masih ada
    const result = users.map(username => {
      // Bersihin username (sama persis kayak waktu create-panel)
      const cleanUser = username.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      return {
        username: username, // Balikin nama asli buat dicocokin di frontend
        exists: existingUsernames.has(cleanUser)
      };
    });

    return res.status(200).json({ success: true, data: result });

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
