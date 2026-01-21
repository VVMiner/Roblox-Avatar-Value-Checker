const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

const app = express();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const ROLIMONS_URL = "https://www.rolimons.com/itemapi/itemdetails";
let cache = null;
let lastCache = 0;

async function refreshCache() {
  const now = Date.now();
  if (cache && now - lastCache < 300000) return; // 5 min

  try {
    const res = await fetch(ROLIMONS_URL);
    if (!res.ok) throw new Error(`Rolimons status ${res.status}`);
    const data = await res.json();
    if (data && data.items) {
      cache = data.items;
      lastCache = now;
      console.log(`Cache updated: ${Object.keys(cache).length} items`);
    }
  } catch (err) {
    console.error('Rolimons refresh failed:', err.message);
  }
}

// Discord commands (optional testing)
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.content.startsWith('!item')) return;

  const id = msg.content.split(' ')[1];
  if (!id || isNaN(id)) return msg.reply('Usage: !item 1234567890');

  await refreshCache();
  const item = cache?.[id];
  if (item && Array.isArray(item) && item.length >= 4) {
    const name = item[0];
    const rap = Number(item[3]) || 0;
    msg.reply(`**${name}** (ID ${id})\nRAP: **${rap.toLocaleString()} R$**`);
  } else {
    msg.reply(`No Rolimons data for ID ${id} (non-limited or not tracked)`);
  }
});

// Web API for Roblox script
app.get('/get-price/:id', async (req, res) => {
  const id = req.params.id;
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

  await refreshCache();
  const item = cache?.[id];
  const price = item && Array.isArray(item) && item.length >= 4 ? Number(item[3]) || 0 : 0;

  res.json({
    success: true,
    id: Number(id),
    price,
    source: item ? 'rolimons' : 'none'
  });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Start everything
(async () => {
  await refreshCache(); // initial load

  client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log(`Bot logged in as ${client.user.tag}`))
    .catch(err => console.error('Discord login failed:', err));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
})();
