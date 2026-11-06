import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const { users } = req.body; // Array of usernames

  const DOMAIN = "https://srv2.cristall.my.id";
  const API_KEY = "ptla_grahKdZyOpmLrn8AlagBblMEd22PPplOUf662TqtrlR";

  try {
    // Ambil semua user di Pterodactyl
    const allUsersRes = await axios.get(`${DOMAIN}/api/application/users`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
    });

    const existingUsernames = allUsersRes.data.data.map(u => u.attributes.username.toLowerCase());

    // Cek mana aja yang masih ada
    const result = users.map(username => {
      const cleanUser = username.toLowerCase().replace(/[^a-z0-9]/g, '');
      return {
        username: username,
        exists: existingUsernames.includes(cleanUser)
      };
    });

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
